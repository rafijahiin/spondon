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
    'clinic_visit':       ('ClinicVisit',            'Clinic Visits',         'ক্লিনিক পরিদর্শন',      'Clinical'),
    'hiv_sti_test':       ('HIVSTITestResult',       'HIV/STI Tests',         'এইচআইভি পরীক্ষা',       'Clinical'),
    'adr_record':         ('ADRRecord',              'ADR Records',           'পার্শ্বপ্রতিক্রিয়া',   'Clinical'),
    'autoclave_log':      ('AutoclaveLog',           'Autoclave Logs',        'অটোক্লেভ লগ',           'Clinical'),
    'antenatal_card':     ('AntenatalCard',          'Antenatal Cards',       'প্রসব পূর্ব যত্ন',      'Clinical'),
    'htc_counselling':    ('HTCCounselling',         'HTC Counselling',       'এইচটিসি পরামর্শ',       'Clinical'),
    'individual_counsel': ('IndividualCounselling',  'Individual Counselling','ব্যক্তিগত পরামর্শ',     'Community'),
    'mh_screening':       ('MHScreening',            'MH Screenings',         'মানসিক স্বাস্থ্য',      'Clinical'),
    'gbv_case':           ('GBVCase',                'GBV Cases',             'জিবিভি কেস',             'Community'),
    'outreach_session':   ('OutreachSession',        'Outreach Sessions',     'আউটরিচ সেশন',           'Community'),
    'group_education':    ('GroupEducationSession',  'Group Education',       'গ্রুপ শিক্ষা',           'Community'),
    'referral':           ('Referral',               'Referrals',             'রেফারেল',                'Community'),
    'hygiene_kit':        ('SafetyHygieneKit',       'Hygiene Kits',          'হাইজিন কিট',             'Community'),
    'training_event':     ('TrainingEvent',          'Training Events',       'প্রশিক্ষণ',              'Operations'),
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
# Bondhu: key populations (FSW, TG, MSM) — Hygiene Kit is Bondhu-only.
# Shared forms (clinic_visit, outreach, counselling, etc.) appear in both lists.
# Used by ProgramsSummaryView to avoid querying irrelevant form types per org.

ORG_FORM_TYPES: dict[str, list[str]] = {
    'PHD': [
        # Clinical
        'clinic_visit', 'antenatal_card', 'hiv_sti_test', 'htc_counselling',
        'mh_screening', 'adr_record', 'autoclave_log',
        # Community
        'outreach_session', 'group_education', 'individual_counsel',
        'gbv_case', 'referral',
        # Operations
        'mobile_camp', 'training_event', 'coord_meeting',
    ],
    'Bondhu': [
        # Clinical
        'clinic_visit', 'hiv_sti_test', 'htc_counselling',
        'mh_screening', 'adr_record', 'autoclave_log',
        # Community
        'outreach_session', 'group_education', 'individual_counsel',
        'gbv_case', 'referral', 'hygiene_kit',
        # Operations
        'training_event', 'coord_meeting',
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
