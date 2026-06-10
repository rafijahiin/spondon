"""
Registry of programs form types and helper queries for the Reporting Progress Tracker.
Maps form type keys → (ModelClass, human label, Bangla label, category).
"""
from __future__ import annotations

import datetime
import logging

logger = logging.getLogger(__name__)

# ── Form type registry ─────────────────────────────────────────────────────────
# key: (model_import_path, label_en, label_bn, category)
# Model classes are imported lazily to avoid circular import issues.

PROGRAMS_REGISTRY: dict[str, tuple[str, str, str, str]] = {
    # key:                (model_name,              label_en,                label_bn,                category)
    # ── PHD new forms ─────────────────────────────────────────────────────────
    'client_registration':('Client',                'FSW Registrations',     'যৌনকর্মী নিবন্ধন',      'Clinical'),
    'clinic_visit':       ('ClinicVisit',            'Clinic Visits',         'ক্লিনিক পরিদর্শন',      'Clinical'),
    'hiv_sti_test':       ('HIVSTITestResult',       'HIV / STI Tests',       'এইচআইভি পরীক্ষা',       'Clinical'),
    'referral':           ('Referral',               'Referrals',             'রেফারেল',                'Community'),
    'group_education':    ('GroupEducationSession',  'Group Education',       'দলগত স্বাস্থ্য শিক্ষা', 'Community'),
    'training_event':     ('TrainingEvent',          'Events & Trainings',    'ইভেন্ট ও প্রশিক্ষণ',    'Operations'),
    'iec_material':       ('IECMaterial',            'IEC Materials',         'আইইসি উপকরণ',           'Operations'),
    'stock_entry':        ('StockEntry',             'Stock Entries',         'স্টক এন্ট্রি',           'Operations'),
    'gbv_corner':         ('GBVCornerRecord',        'GBV Corners',           'জিবিভি কর্নার',          'Operations'),
    # ── Bandhu / shared forms ─────────────────────────────────────────────────
    'adr_record':         ('ADRRecord',              'ADR Records',           'পার্শ্বপ্রতিক্রিয়া',   'Clinical'),
    'autoclave_log':      ('AutoclaveLog',           'Autoclave Logs',        'অটোক্লেভ লগ',           'Clinical'),
    'antenatal_card':     ('AntenatalCard',          'Antenatal Cards',       'প্রসব পূর্ব যত্ন',      'Clinical'),
    'htc_counselling':    ('HTCCounselling',         'HTC Counselling',       'এইচটিসি পরামর্শ',       'Clinical'),
    'individual_counselling': ('IndividualCounselling', 'Individual Counselling', 'ব্যক্তিগত পরামর্শ',  'Community'),
    'mh_screening':       ('MHScreening',            'MH Screenings',         'মানসিক স্বাস্থ্য',      'Clinical'),
    'gbv_case':           ('GBVCase',                'GBV Cases',             'জিবিভি কেস',             'Community'),
    'outreach_session':   ('OutreachSession',        'Outreach Sessions',     'আউটরিচ সেশন',           'Community'),
    'hygiene_kit':        ('SafetyHygieneKit',       'Hygiene Kits',          'হাইজিন কিট',             'Community'),
    'coord_meeting':      ('CoordMeeting',           'Coord. Meetings',       'সমন্বয় সভা',            'Operations'),
    'mobile_camp':        ('MobileHealthCamp',       'Mobile Health Camps',   'মোবাইল ক্যাম্প',        'Operations'),
}

LEGACY_REGISTRY: dict[str, tuple[str, str, str]] = {
    'mpdsr':    ('MPDSR Cases',        'MPDSR কেস',              'Legacy'),
    'fistula':  ('Fistula Campaign',   'ফিস্টুলা ক্যাম্পেইন',   'Legacy'),
    'activity': ('Activity Reports',   'কার্যক্রম রিপোর্ট',      'Legacy'),
    'baseline': ('Baseline Survey',    'বেসলাইন সমীক্ষা',        'Legacy'),
}

CATEGORY_ORDER = ['Clinical', 'Community', 'Operations', 'Legacy']

# ── Per-org form type lists ────────────────────────────────────────────────────
# Defines which form types each organisation actually uses.
# PHD: maternal/reproductive health — ANC and Mobile Camps are PHD-only.
# Bandhu: key populations (FSW, TG, MSM) — Hygiene Kit is Bandhu-only.
# Shared forms (clinic_visit, outreach, counselling, etc.) appear in both lists.
# Used by ProgramsSummaryView to avoid querying irrelevant form types per org.

ORG_FORM_TYPES: dict[str, list[str]] = {
    'PHD': [
        # Clinical — from Patient Services form
        'client_registration', 'clinic_visit', 'hiv_sti_test',
        # Community — from Patient Services + Activity & Ops
        'referral', 'group_education',
        # Operations — from Activity & Ops form
        'training_event', 'iec_material', 'stock_entry', 'gbv_corner',
    ],
    'Bandhu': [
        # Only the models Bandhu's 2 Kobo forms actually write to (per
        # bandhu_handlers.py). The Service Log → ClinicVisit (F-05),
        # HIVSTITestResult (F-06), GBVCase (F-02), IndividualCounselling
        # (F-03/Counseling), Referral (Referral/F-08). The Activity & Ops
        # form → OutreachSession (F-04), MobileHealthCamp (F-10),
        # TrainingEvent/CoordMeeting (F-12), IECMaterial (F-14).
        # (Autoclave / ADR / MH-screening / HTC-counselling / group-education
        # / hygiene-kit are NOT Bandhu tools — removed.)
        # Clinical
        'clinic_visit', 'hiv_sti_test',
        # Community
        'individual_counselling', 'gbv_case', 'referral', 'outreach_session',
        # Operations
        'mobile_camp', 'training_event', 'coord_meeting', 'iec_material',
    ],
}


def _get_programs_model(model_name: str):
    """Lazily import a programs model by class name."""
    from programs import models as pm
    return getattr(pm, model_name)


def count_programs(form_type_key: str, organisation: str,
                   year: int, month: int) -> int:
    """Count approved programs submissions for a period."""
    if form_type_key not in PROGRAMS_REGISTRY:
        return 0
    model_name = PROGRAMS_REGISTRY[form_type_key][0]
    try:
        model = _get_programs_model(model_name)
        qs = model.objects.filter(
            approval_status='APPROVED',
            created_at__year=year,
            created_at__month=month,
        )
        if organisation:
            qs = qs.filter(organisation=organisation)
        return qs.count()
    except Exception as exc:
        logger.debug('count_programs(%s, %s): %s', form_type_key, organisation, exc)
        return 0


def last_submission_programs(form_type_key: str,
                             organisation: str) -> datetime.datetime | None:
    """Return the created_at of the most recent approved submission, or None."""
    if form_type_key not in PROGRAMS_REGISTRY:
        return None
    model_name = PROGRAMS_REGISTRY[form_type_key][0]
    try:
        model = _get_programs_model(model_name)
        qs = model.objects.filter(approval_status='APPROVED')
        if organisation:
            qs = qs.filter(organisation=organisation)
        obj = qs.order_by('-created_at').first()
        return obj.created_at if obj else None
    except Exception:
        return None


def has_recent_programs(form_type_key: str, organisation: str,
                        cutoff: datetime.datetime) -> bool:
    """Return True if at least one submission exists after cutoff."""
    if form_type_key not in PROGRAMS_REGISTRY:
        return True   # unknown type: don't flag as gap
    model_name = PROGRAMS_REGISTRY[form_type_key][0]
    try:
        model = _get_programs_model(model_name)
        qs = model.objects.filter(created_at__gte=cutoff)
        if organisation:
            qs = qs.filter(organisation=organisation)
        return qs.exists()
    except Exception:
        return True


def daily_reporting_activity(organisation: str, threshold_dt, today_start):
    """Field-reporting activity from the PROGRAMS submission models, for the
    daily-reporting health widget.

    Counts ALL submissions (any approval status) — a centre that submitted but
    is not yet approved has still *reported*; approval is a separate gate. The
    legacy KoboSubmission table holds none of the partners' current data, so
    without this the widget reads 0/silent for PHD/Bandhu/CIPRB forever.

    Returns (recent_count, today_count, today_centre_codes, last_submitted_at).
    """
    from django.apps import apps
    recent_count = today_count = 0
    today_codes: set[str] = set()
    last = None
    for model in apps.get_app_config('programs').get_models():
        fields = {f.name for f in model._meta.get_fields()}
        if not {'organisation', 'created_at', 'approval_status'} <= fields:
            continue
        try:
            base = model.objects.all()
            if organisation:
                base = base.filter(organisation=organisation)
            recent_count += base.filter(created_at__gte=threshold_dt).count()
            today_qs = base.filter(created_at__gte=today_start)
            today_count += today_qs.count()
            if 'center' in fields:
                today_codes.update(
                    c for c in today_qs.values_list('center__code', flat=True) if c
                )
            obj = base.order_by('-created_at').values_list('created_at', flat=True).first()
            if obj and (last is None or obj > last):
                last = obj
        except Exception as exc:
            logger.debug('daily_reporting_activity(%s, %s): %s',
                         organisation, model.__name__, exc)
    return recent_count, today_count, today_codes, last


def count_legacy(form_type_key: str, organisation: str,
                 year: int, month: int) -> int:
    """Count approved legacy KoboSubmission records."""
    try:
        from submissions.models import KoboSubmission, SubmissionStatus
        qs = KoboSubmission.objects.filter(
            form_type=form_type_key,
            status=SubmissionStatus.APPROVED,
            submitted_at__year=year,
            submitted_at__month=month,
        )
        if organisation:
            qs = qs.filter(partner=organisation)
        return qs.count()
    except Exception:
        return 0


def last_submission_legacy(form_type_key: str,
                           organisation: str) -> datetime.datetime | None:
    """Return the submitted_at of the most recent approved legacy submission."""
    try:
        from submissions.models import KoboSubmission, SubmissionStatus
        qs = KoboSubmission.objects.filter(
            form_type=form_type_key,
            status=SubmissionStatus.APPROVED,
        )
        if organisation:
            qs = qs.filter(partner=organisation)
        obj = qs.order_by('-submitted_at').first()
        return obj.submitted_at if obj else None
    except Exception:
        return None


def has_recent_legacy(form_type_key: str, organisation: str,
                      cutoff: datetime.datetime) -> bool:
    try:
        from submissions.models import KoboSubmission
        qs = KoboSubmission.objects.filter(
            form_type=form_type_key,
            submitted_at__gte=cutoff,
        )
        if organisation:
            qs = qs.filter(partner=organisation)
        return qs.exists()
    except Exception:
        return True
