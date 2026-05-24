"""
Programme data aggregation for report generation.
Queries approved submissions across all programs models for a given date range.
All generators consume the dict returned by collect_programme_data().
"""
from __future__ import annotations

import logging
from datetime import date

logger = logging.getLogger(__name__)

# Human-readable labels for each form type key
LABEL_MAP: dict[str, str] = {
    'clinic_visits':          'Clinic Visits',
    'hiv_sti_tests':          'HIV/STI Tests',
    'adr_records':            'ADR Records',
    'autoclave_logs':         'Autoclave Logs',
    'antenatal_cards':        'Antenatal Cards',
    'htc_counselling':        'HTC Counselling',
    'individual_counselling': 'Individual Counselling',
    'mh_screenings':          'MH Screenings',
    'gbv_cases':              'GBV Cases',
    'outreach_sessions':      'Outreach Sessions',
    'group_education':        'Group Education',
    'referrals':              'Referrals',
    'hygiene_kits':           'Hygiene Kits',
    'training_events':        'Training Events',
    'coord_meetings':         'Coord. Meetings',
    'mobile_camps':           'Mobile Camps',
}


def _count_model(model, period_start: date, period_end: date, organisation: str = '') -> int:
    """Safely count approved SubmissionBase records for a period."""
    try:
        qs = model.objects.filter(
            approval_status='APPROVED',
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        )
        if organisation:
            qs = qs.filter(organisation=organisation)
        return qs.count()
    except Exception as exc:
        logger.debug('_count_model failed for %s: %s', model.__name__, exc)
        return 0


def collect_programme_data(
    period_start: date,
    period_end: date,
    organisation: str = '',
) -> dict:
    """
    Aggregate all programme metrics for a reporting period.

    Returns a structured dict that is consumed by all three generators
    (infographic PDF, newsletter PDF, PPTX).
    """
    from programs.models import (
        ClinicVisit, HIVSTITestResult, ADRRecord, AutoclaveLog, AntenatalCard,
        HTCCounselling, IndividualCounselling, MHScreening,
        GBVCase,
        OutreachSession, GroupEducationSession,
        Referral,
        SafetyHygieneKit,
        TrainingEvent, CoordMeeting, MobileHealthCamp,
    )

    def _m(model):
        return _count_model(model, period_start, period_end, organisation)

    counts = {
        'clinic_visits':          _m(ClinicVisit),
        'hiv_sti_tests':          _m(HIVSTITestResult),
        'adr_records':            _m(ADRRecord),
        'autoclave_logs':         _m(AutoclaveLog),
        'antenatal_cards':        _m(AntenatalCard),
        'htc_counselling':        _m(HTCCounselling),
        'individual_counselling': _m(IndividualCounselling),
        'mh_screenings':          _m(MHScreening),
        'gbv_cases':              _m(GBVCase),
        'outreach_sessions':      _m(OutreachSession),
        'group_education':        _m(GroupEducationSession),
        'referrals':              _m(Referral),
        'hygiene_kits':           _m(SafetyHygieneKit),
        'training_events':        _m(TrainingEvent),
        'coord_meetings':         _m(CoordMeeting),
        'mobile_camps':           _m(MobileHealthCamp),
    }

    total = sum(counts.values())

    # --- Fistula legacy data ---
    fistula_cases = 0
    try:
        from fistula.models import FistulaCampaign
        from django.db.models import Sum as _Sum
        fq = FistulaCampaign.objects.filter(
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        )
        if organisation:
            fq = fq.filter(partner=organisation)
        fistula_cases = fq.aggregate(t=_Sum('cases_identified'))['t'] or 0
    except Exception as exc:
        logger.debug('fistula aggregation skipped: %s', exc)

    # --- MPDSR legacy data (from submissions app) ---
    mpdsr_cases = 0
    try:
        from submissions.models import KoboSubmission, FormType, SubmissionStatus
        mq = KoboSubmission.objects.filter(
            form_type=FormType.MPDSR,
            status=SubmissionStatus.APPROVED,
            submitted_at__date__gte=period_start,
            submitted_at__date__lte=period_end,
        )
        if organisation:
            mq = mq.filter(partner=organisation)
        mpdsr_cases = mq.count()
    except Exception as exc:
        logger.debug('mpdsr aggregation skipped: %s', exc)

    # --- Top-4 KPI tiles ---
    top_kpis = [
        {'label': 'Total Activities',   'value': total},
        {'label': 'Clinic Visits',      'value': counts['clinic_visits']},
        {'label': 'Outreach Sessions',  'value': counts['outreach_sessions']},
        {'label': 'GBV Cases',          'value': counts['gbv_cases']},
    ]

    # --- Chart data: top 8 form types sorted ascending (highest at top in horizontal chart) ---
    all_items = [(LABEL_MAP[k], v) for k, v in counts.items()]
    chart_data = sorted(all_items, key=lambda x: x[1])[-8:]   # ascending → highest at top
    if not chart_data:
        chart_data = [(LABEL_MAP[k], 0) for k in list(LABEL_MAP)[:4]]

    # --- Period label ---
    ps, pe = period_start, period_end
    if ps.year == pe.year and ps.month == pe.month:
        period_label = f"{ps.day}–{pe.day} {pe.strftime('%b %Y')}"
    elif ps.year == pe.year:
        period_label = f"{ps.day} {ps.strftime('%b')} – {pe.day} {pe.strftime('%b %Y')}"
    else:
        period_label = (
            f"{ps.day} {ps.strftime('%b %Y')} – {pe.day} {pe.strftime('%b %Y')}"
        )

    return {
        'period_start':      period_start,
        'period_end':        period_end,
        'period_label':      period_label,
        'organisation':      organisation or 'All Partners',
        'total_submissions': total,
        'counts':            counts,
        'fistula_cases':     fistula_cases,
        'mpdsr_cases':       mpdsr_cases,
        'top_kpis':          top_kpis,
        'chart_data':        chart_data,   # list of (label, value) tuples, ascending
    }
