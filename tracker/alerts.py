"""
Alert generation helpers.  Called from management commands or cron tasks
to detect below-target performance and overdue cases.
"""
import datetime
import logging

from django.utils import timezone

logger = logging.getLogger(__name__)


def generate_below_target_alerts(dry_run: bool = False) -> list[dict]:
    """
    Compare current-month approved submission counts against MonthlyTarget.
    Creates Alert records for partners tracking below 80% of target.
    Returns a list of created alert dicts (for logging / testing).
    """
    from submissions.models import KoboSubmission, SubmissionStatus
    from .models import Alert, AlertSeverity, AlertType, MonthlyTarget

    now = timezone.now()
    year, month = now.year, now.month

    targets = MonthlyTarget.objects.filter(year=year, month=month)
    created_alerts = []

    for t in targets:
        actual = KoboSubmission.objects.filter(
            partner=t.partner,
            form_type=t.form_type,
            status=SubmissionStatus.APPROVED,
            submitted_at__year=year,
            submitted_at__month=month,
        ).count()

        pct = actual / t.target * 100 if t.target > 0 else 100
        if pct >= 80:
            continue

        severity = AlertSeverity.CRITICAL if pct < 50 else AlertSeverity.WARNING
        title = f'{t.partner} {t.form_type.upper()} below target ({pct:.0f}%)'
        message = (
            f'Only {actual} of {t.target} target submissions received '
            f'for {t.partner} ({t.form_type}) in {year}-{month:02d}.'
        )

        alert_data = {
            'partner': t.partner,
            'alert_type': AlertType.BELOW_TARGET,
            'severity': severity,
            'title': title,
            'message': message,
        }
        if not dry_run:
            Alert.objects.create(**alert_data)
        created_alerts.append(alert_data)
        logger.info('Alert created: %s', title)

    return created_alerts


def generate_overdue_case_alerts(dry_run: bool = False) -> list[dict]:
    """Create alerts for fistula/MPDSR cases with passed follow-up/committee dates."""
    from fistula.models import CaseStatus, FistulaCase
    from mpdsr.models import MPDSRCase, ReviewStatus
    from .models import Alert, AlertSeverity, AlertType

    today = datetime.date.today()
    created_alerts = []

    overdue_fistula = FistulaCase.objects.filter(
        follow_up_date__lt=today,
        follow_up_date__isnull=False,
    ).exclude(status=CaseStatus.REFERRAL_COMPLETED)

    for partner in overdue_fistula.values_list('partner', flat=True).distinct():
        count = overdue_fistula.filter(partner=partner).count()
        title = f'{partner}: {count} overdue fistula follow-up(s)'
        alert_data = {
            'partner': partner,
            'alert_type': AlertType.OVERDUE_CASES,
            'severity': AlertSeverity.WARNING,
            'title': title,
            'message': f'{count} fistula case(s) have passed their follow-up date.',
        }
        if not dry_run:
            Alert.objects.create(**alert_data)
        created_alerts.append(alert_data)

    overdue_mpdsr = MPDSRCase.objects.filter(
        committee_date__lt=today,
        committee_date__isnull=False,
    ).exclude(status=ReviewStatus.CLOSED)

    for partner in overdue_mpdsr.values_list('partner', flat=True).distinct():
        count = overdue_mpdsr.filter(partner=partner).count()
        title = f'{partner}: {count} overdue MPDSR committee review(s)'
        alert_data = {
            'partner': partner,
            'alert_type': AlertType.OVERDUE_CASES,
            'severity': AlertSeverity.WARNING,
            'title': title,
            'message': f'{count} MPDSR case(s) have passed their committee review date.',
        }
        if not dry_run:
            Alert.objects.create(**alert_data)
        created_alerts.append(alert_data)

    return created_alerts
