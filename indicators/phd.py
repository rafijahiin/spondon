"""
PHD indicator compute functions — rebuilt for the 3 consolidated PHD forms.

All 16 SL indicators read from the models that the NEW PHD forms populate:
  phd_registration_v1      → Client
  phd_patient_services_v1  → ClinicVisit, HIVSTITestResult, Referral
  phd_activity_ops_v1      → GroupEducationSession, TrainingEvent,
                             IECMaterial, StockEntry, GBVCornerRecord

Targets corrected to match PHD_SIDA_Activities_Indicators_Output_Outcome.docx.
All filter on approval_status='APPROVED' only.
"""
from django.db.models import Q, Sum

from programs.models import (
    Client, ClinicVisit, HIVSTITestResult,
    GroupEducationSession, Referral,
    ServiceCenter, TrainingEvent, StockEntry, IECMaterial,
    GBVCornerRecord,
)

APPROVED = 'APPROVED'
PHD = 'PHD'


# ── SL1 — FSWs receiving HIV/STI screening and FP counselling  ──────────────
# Source: Patient Record Register (clinic_hiv_screen / clinic_syphilis_screen)
# Target: 3,500 FSWs (distinct)
def compute_I_PHD_1_1(org, period_start, period_end):
    return ClinicVisit.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        visit_date__range=(period_start, period_end),
    ).filter(
        Q(hiv_screening_done=True) | Q(sti_screening_done=True)
    ).values('client_id').distinct().count()


# ── SL2 — GBV survivors identified and referred ─────────────────────────────
# Source: Patient Record Register (GBV Screening + GBV referral columns)
# Target: 100 GBV survivors (distinct clinic visits with GBV flag)
def compute_I_PHD_1_2(org, period_start, period_end):
    return ClinicVisit.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        visit_date__range=(period_start, period_end),
    ).filter(
        Q(gbv_screening_done=True) | Q(referral_gbv=True)
    ).values('client_id').distinct().count()


# ── SL3 — FSWs receiving mental health counselling ──────────────────────────
# Source: Patient Record Register (Mental Health Screening column)
# Target: 100 FSWs (distinct)
def compute_I_PHD_1_3(org, period_start, period_end):
    return ClinicVisit.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        visit_date__range=(period_start, period_end),
        mh_screening_done=True,
    ).values('client_id').distinct().count()


# ── SL4 — Outreach sessions conducted ───────────────────────────────────────
# Source: Group Health Education (group_edu section → GroupEducationSession)
# Target: 897 sessions
def compute_I_PHD_1_4(org, period_start, period_end):
    return GroupEducationSession.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).count()


# ── SL5 — Essential SRHR & GBV supplies (commodities) ───────────────────────
# Source: Stock register → StockEntry
# 5A: Condoms distributed (quantity_issued for condom items)
# 5B: Syphilis kits   5C: Hep B kits   5D: Hep C kits   5E: HIV kits
def compute_I_PHD_1_5A(org, period_start, period_end):
    return StockEntry.objects.filter(
        organisation=org,
        reporting_month__range=(period_start, period_end),
        item_name__icontains='condom',
    ).aggregate(t=Sum('quantity_issued'))['t'] or 0


def _kit(org, period_start, period_end, fragment):
    return StockEntry.objects.filter(
        organisation=org,
        reporting_month__range=(period_start, period_end),
        item_name__icontains=fragment,
    ).aggregate(t=Sum('quantity_issued'))['t'] or 0


def compute_I_PHD_1_5B(org, period_start, period_end):
    return _kit(org, period_start, period_end, 'syphilis')


def compute_I_PHD_1_5C(org, period_start, period_end):
    return _kit(org, period_start, period_end, 'hepatitis b')


def compute_I_PHD_1_5D(org, period_start, period_end):
    return _kit(org, period_start, period_end, 'hepatitis c')


def compute_I_PHD_1_5E(org, period_start, period_end):
    return _kit(org, period_start, period_end, 'hiv')


# ── SL6 — HIV/STI positive cases referred and enrolled in treatment ──────────
# Source: HTC Service register (htc section) → HIVSTITestResult
#         Referral register (referral section) → Referral
# Target: 135 cases
def compute_I_PHD_1_6(org, period_start, period_end):
    positive_clients = HIVSTITestResult.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        testing_date__range=(period_start, period_end),
        hiv_result='positive',
    ).values_list('client_id', flat=True)

    return Referral.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        client_id__in=positive_clients,
    ).values('client_id').distinct().count()


# ── SL7 — GBV survivors referred for MHPSS ──────────────────────────────────
# Source: Patient Record Register (MHPSS referral column → referral_mental_health)
# Target: 50
def compute_I_PHD_1_7_mhpss(org, period_start, period_end):
    return ClinicVisit.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        visit_date__range=(period_start, period_end),
        referral_mental_health=True,
    ).values('client_id').distinct().count()


# ── SL8 — Functional wellness centres ───────────────────────────────────────
# Source: ServiceCenter registry (static)
# Target: 9
def compute_I_PHD_1_8_centres(org):
    return ServiceCenter.objects.filter(organisation=org, is_active=True).count()


# ── SL9 — Mobile health camps conducted ─────────────────────────────────────
# Source: event database → TrainingEvent where event_type='camp'
# Target: 90
def compute_I_PHD_1_9_camps(org, period_start, period_end):
    return TrainingEvent.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        event_type='camp',
    ).count()


# ── SL10 — DGFP/DGHS/DGNM focal points oriented ────────────────────────────
# Source: event database → TrainingEvent participant_type='HM', type orientation
# Target: 30 participants (1 event)
def compute_I_PHD_2_1A(org, period_start, period_end):
    return TrainingEvent.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type='HM',
        event_type__in=('orientation', TrainingEvent.ORIENTATION),
    ).aggregate(t=Sum('total_participants'))['t'] or 0


# ── SL11 — Health managers and supervisors oriented ─────────────────────────
# Source: TrainingEvent participant_type='GOB', type orientation
# Target: 140 participants (7 events)
def compute_I_PHD_2_1B(org, period_start, period_end):
    return TrainingEvent.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type='GOB',
        event_type__in=('orientation', TrainingEvent.ORIENTATION),
    ).aggregate(t=Sum('total_participants'))['t'] or 0


# ── SL12 — Medical Assistants / Midwives trained ────────────────────────────
# Source: TrainingEvent participant_type='MW', type training
# Target: 10 participants
def compute_I_PHD_2_2(org, period_start, period_end):
    return TrainingEvent.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type='MW',
        event_type__in=('training', TrainingEvent.TRAINING),
    ).aggregate(t=Sum('total_participants'))['t'] or 0


# ── SL13 — Peer educators and community leaders trained ─────────────────────
# Source: TrainingEvent participant_type='PE'
# Target: 20 participants
def compute_I_PHD_2_3(org, period_start, period_end):
    return TrainingEvent.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type='PE',
    ).aggregate(t=Sum('total_participants'))['t'] or 0


# ── SL14 — Quarterly coordination meetings ──────────────────────────────────
# Source: event database → TrainingEvent where event_type='coord_meeting'
# Target: 18 meetings
def compute_I_PHD_2_4(org, period_start, period_end):
    return TrainingEvent.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        event_type='coord_meeting',
    ).count()


# ── SL15 — Install billboards and communication materials ───────────────────
# Source: material database → IECMaterial
# 3.1a: Message boards (target 99)
# 3.1b: Signboards    (target 9)
# 3.1c: Billboards    (target 11)
def _iec(org, period_start, period_end, mat_type):
    return IECMaterial.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        date_distributed__range=(period_start, period_end),
        material_type=mat_type,
    ).aggregate(t=Sum('quantity'))['t'] or 0


def compute_I_PHD_3_1A(org, period_start, period_end):
    return _iec(org, period_start, period_end, IECMaterial.MESSAGE_BOARD)


def compute_I_PHD_3_1B(org, period_start, period_end):
    return _iec(org, period_start, period_end, IECMaterial.SIGNBOARD)


def compute_I_PHD_3_1C(org, period_start, period_end):
    return _iec(org, period_start, period_end, IECMaterial.BILLBOARD)


# ── SL16 — GBV corners established and fully operational ────────────────────
# Source: gbv corner establishment database → GBVCornerRecord
# Target: 44 facilities
def compute_I_PHD_2_5(org, period_start, period_end):
    return GBVCornerRecord.objects.filter(
        organisation=org,
        approval_status=APPROVED,
        date_of_establishment__range=(period_start, period_end),
        fully_functional=True,
    ).count()


# ── Overall: brothels / wellness centres covered ────────────────────────────
def compute_phd_overall(org):
    return ServiceCenter.objects.filter(organisation=org, is_active=True).count()


# ─── Activity-code registry ──────────────────────────────────────────────────
ACTIVITY_REGISTRY = {
    'OVERALL': compute_phd_overall,       # org-only
    '1.1':  compute_I_PHD_1_1,
    '1.2':  compute_I_PHD_1_2,
    '1.3':  compute_I_PHD_1_3,
    '1.4':  compute_I_PHD_1_4,
    '1.5a': compute_I_PHD_1_5A,
    '1.5b': compute_I_PHD_1_5B,
    '1.5c': compute_I_PHD_1_5C,
    '1.5d': compute_I_PHD_1_5D,
    '1.5e': compute_I_PHD_1_5E,
    '1.6':  compute_I_PHD_1_6,
    '1.7':  compute_I_PHD_1_8_centres,   # org-only (functional centres)
    '1.8':  compute_I_PHD_1_9_camps,     # mobile health camps
    '2.1a': compute_I_PHD_2_1A,
    '2.1b': compute_I_PHD_2_1B,
    '2.2':  compute_I_PHD_2_2,
    '2.3':  compute_I_PHD_2_3,
    '2.4':  compute_I_PHD_2_4,
    '2.5':  compute_I_PHD_2_5,           # GBV corners (was unlinked)
    '3.1a': compute_I_PHD_3_1A,
    '3.1b': compute_I_PHD_3_1B,
    '3.1c': compute_I_PHD_3_1C,
    # SL7 (MHPSS referral) registered under its fixture code
    'mhpss': compute_I_PHD_1_7_mhpss,
}

ORG_ONLY_CODES = {'OVERALL', '1.7'}
