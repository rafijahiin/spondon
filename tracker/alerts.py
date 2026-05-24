"""
Alert generation helpers. Called from management commands or cron tasks.
"""
import datetime
import logging

from django.utils import timezone

logger = logging.getLogger(__name__)


def generate_below_target_alerts(dry_run: bool = False) -> list[dict]:
    """
    Compare current-month approved submission counts against MonthlyTarget.
    Creates Alert records for partners tracking below 80% of target.
    Covers both legacy KoboSubmission and programs models.
    """
    from .models import Alert, AlertSeverity, AlertType, MonthlyTarget
    from .programs_query import (
        PROGRAMS_REGISTRY, LEGACY_REGISTRY,
        count_programs, count_legacy,
    )

    now = timezone.now()
    year, month = now.year, now.month

    targets = MonthlyTarget.objects.filter(year=year, month=month)
    created_alerts = []

    for t in targets:
        if t.form_type in PROGRAMS_REGISTRY:
            actual = count_programs(t.form_type, t.partner, year, month)
        else:
            actual = count_legacy(t.form_type, t.partner, year, month)

        pct = actual / t.target * 100 if t.target > 0 else 100
        if pct >= 80:
            continue

        severity = AlertSeverity.CRITICAL if pct < 50 else AlertSeverity.WARNING
        reg = PROGRAMS_REGISTRY.get(t.form_type) or (None, LEGACY_REGISTRY.get(t.form_type, (t.form_type,))[0], None, None)
        label = reg[1] if isinstance(reg, tuple) and len(reg) > 1 else t.form_type

        title = f'{t.partner} — {label}: {pct:.0f}% of target'
        message = (
            f'{actual} of {t.target} expected submissions received for '
            f'{t.partner} ({label}) in {year}-{month:02d}.'
        )

        alert_data = {
            'partner':     t.partner,
            'alert_type':  AlertType.BELOW_TARGET,
            'severity':    severity,
            'title':       title,
            'message':     message,
        }
        if not dry_run:
            Alert.objects.create(**alert_data)
        created_alerts.append(alert_data)
        logger.info('Alert created: %s', title)

    return created_alerts


def generate_overdue_case_alerts(dry_run: bool = False) -> list[dict]:
    """Create alerts for fistula/MPDSR cases with passed follow-up/committee dates."""
    from .models import Alert, AlertSeverity, AlertType

    today = datetime.date.today()
    created_alerts = []

    try:
        from fistula.models import CaseStatus, FistulaCase
        overdue_fistula = FistulaCase.objects.filter(
            follow_up_date__lt=today,
            follow_up_date__isnull=False,
        ).exclude(status=CaseStatus.REFERRAL_COMPLETED)

        for partner in overdue_fistula.values_list('partner', flat=True).distinct():
            count = overdue_fistula.filter(partner=partner).count()
            title = f'{partner}: {count} overdue fistula follow-up(s)'
            alert_data = {
                'partner':    partner,
                'alert_type': AlertType.OVERDUE_CASES,
                'severity':   AlertSeverity.WARNING,
                'title':      title,
                'message':    f'{count} fistula case(s) have passed their follow-up date.',
            }
            if not dry_run:
                Alert.objects.create(**alert_data)
            created_alerts.append(alert_data)
    except Exception as exc:
        logger.debug('overdue fistula query skipped: %s', exc)

    try:
        from mpdsr.models import MPDSRCase, ReviewStatus
        overdue_mpdsr = MPDSRCase.objects.filter(
            committee_date__lt=today,
            committee_date__isnull=False,
        ).exclude(status=ReviewStatus.CLOSED)

        for partner in overdue_mpdsr.values_list('partner', flat=True).distinct():
            count = overdue_mpdsr.filter(partner=partner).count()
            title = f'{partner}: {count} overdue MPDSR committee review(s)'
            alert_data = {
                'partner':    partner,
                'alert_type': AlertType.OVERDUE_CASES,
                'severity':   AlertSeverity.WARNING,
                'title':      title,
                'message':    f'{count} MPDSR case(s) have passed their committee review date.',
            }
            if not dry_run:
                Alert.objects.create(**alert_data)
            created_alerts.append(alert_data)
    except Exception as exc:
        logger.debug('overdue MPDSR query skipped: %s', exc)

    return created_alerts


def detect_submission_gaps(dry_run: bool = False) -> list[dict]:
    """
    For each active monthly target, check whether any submission was received in
    the last 48 hours. If not, raise a SUBMISSION_GAP alert and send Telegram.
    Covers both legacy (KoboSubmission) and programs models.
    Deduplicates: only one unacknowledged gap alert per partner/form_type per day.
    """
    from .models import Alert, AlertSeverity, AlertType, MonthlyTarget
    from .programs_query import (
        PROGRAMS_REGISTRY,
        has_recent_programs, has_recent_legacy,
    )

    now    = timezone.now()
    cutoff = now - datetime.timedelta(hours=48)
    year, month = now.year, now.month

    targets = MonthlyTarget.objects.filter(year=year, month=month)
    created_alerts = []

    for t in targets:
        if t.form_type in PROGRAMS_REGISTRY:
            has_recent = has_recent_programs(t.form_type, t.partner, cutoff)
            reg = PROGRAMS_REGISTRY[t.form_type]
            label = reg[1]
        else:
            has_recent = has_recent_legacy(t.form_type, t.partner, cutoff)
            label = t.form_type.upper()

        if has_recent:
            continue

        # Deduplicate: skip if unacknowledged gap alert already raised today
        already_alerted = Alert.objects.filter(
            partner=t.partner,
            alert_type=AlertType.SUBMISSION_GAP,
            acknowledged=False,
            created_at__date=now.date(),
        ).filter(title__icontains=label[:20]).exists()

        if already_alerted:
            continue

        title   = f'{t.partner} — {label}: no submissions in 48 h'
        message = (
            f'No {label} submissions received from {t.partner} in the last 48 hours. '
            f'Focal person has been notified via Telegram.'
        )

        alert_data = {
            'partner':    t.partner,
            'alert_type': AlertType.SUBMISSION_GAP,
            'severity':   AlertSeverity.WARNING,
            'title':      title,
            'message':    message,
        }

        if not dry_run:
            Alert.objects.create(**alert_data)
            _send_gap_telegram(t.partner, label)

        created_alerts.append(alert_data)
        logger.info('Gap alert created: %s', title)

    return created_alerts


def _send_gap_telegram(partner: str, form_label: str) -> None:
    """Send a Telegram alert for a 48-hour submission gap."""
    from django.conf import settings
    import json, urllib.request

    token   = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
    chat_id = getattr(settings, f'TELEGRAM_CHAT_ID_{partner.upper()}',
              getattr(settings, 'TELEGRAM_CHAT_ID_CIPRB', ''))
    if not token or not chat_id:
        logger.debug('Telegram not configured for gap alerts (%s)', partner)
        return

    text = (
        f'⚠️ <b>Submission Gap Alert</b>\n\n'
        f'<b>Organisation:</b> {partner}\n'
        f'<b>Form type:</b> {form_label}\n\n'
        f'No submissions received in the last <b>48 hours</b>.\n'
        f'Please check with field staff and follow up.'
    )
    payload = json.dumps({
        'chat_id':    chat_id,
        'text':       text,
        'parse_mode': 'HTML',
    }).encode()

    try:
        req = urllib.request.Request(
            f'https://api.telegram.org/bot{token}/sendMessage',
            data=payload,
            headers={'Content-Type': 'application/json'},
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as exc:
        logger.error('Gap alert Telegram send failed: %s', exc)
