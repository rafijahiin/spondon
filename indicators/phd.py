"""
PHD (Partners in Health and Development) indicator compute functions.
All filter on approval_status='APPROVED' only.
"""
from django.db.models import Q, Sum
from programs.models import (
    Client, ClinicVisit, HIVSTITestResult, IndividualCounselling,
    OutreachSession, GBVCase, Referral,
    ServiceCenter, TrainingEvent, CoordMeeting, MobileHealthCamp, StockEntry,
    IECMaterial,
)

APPROVED = 'APPROVED'


def compute_I_PHD_1_1(org, period_start, period_end):
    """FSWs receiving HIV/STI screening + FP counselling. Target: 3,484"""
    fsw_clients = Client.objects.filter(
        organisation=org, target_group_code='05'
    ).values_list('id', flat=True)

    screened = ClinicVisit.objects.filter(
        organisation=org, approval_status=APPROVED,
        visit_date__range=(period_start, period_end),
        client_id__in=fsw_clients,
    ).filter(
        Q(hiv_screening_done=True) | Q(sti_screening_done=True)
    ).values_list('client_id', flat=True).distinct()

    return screened.count()


def compute_I_PHD_1_2(org, period_start, period_end):
    """GBV survivors identified and referred. Target: 100"""
    return GBVCase.objects.filter(
        organisation=org, approval_status=APPROVED,
        incident_date__range=(period_start, period_end),
    ).count()


def compute_I_PHD_1_3(org, period_start, period_end):
    """FSWs receiving mental health counselling. Target: 1,000"""
    return IndividualCounselling.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
        issue_psychosocial=True,
    ).values('client').distinct().count()


def compute_I_PHD_1_4(org, period_start, period_end):
    """Outreach sessions conducted. Target: 897"""
    return OutreachSession.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).count()


def compute_I_PHD_1_5A(org, period_start, period_end):
    """Condoms distributed. Target: 679,380"""
    clinic = ClinicVisit.objects.filter(
        organisation=org, approval_status=APPROVED,
        visit_date__range=(period_start, period_end),
    ).aggregate(t=Sum('condoms_distributed'))['t'] or 0

    outreach = OutreachSession.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).aggregate(t=Sum('condoms_distributed_free'))['t'] or 0

    return clinic + outreach


def _compute_kit_usage(org, period_start, period_end, item_fragment):
    """Generic kit usage from monthly stock entries."""
    return StockEntry.objects.filter(
        organisation=org,
        reporting_month__range=(period_start, period_end),
        item_name__icontains=item_fragment,
    ).aggregate(t=Sum('quantity_issued'))['t'] or 0


def compute_I_PHD_1_5B(org, period_start, period_end):
    """Syphilis Screening Kits used. Target: 140 boxes"""
    return _compute_kit_usage(org, period_start, period_end, 'syphilis')


def compute_I_PHD_1_5C(org, period_start, period_end):
    """Hepatitis B Screening Kits. Target: 176 boxes"""
    return _compute_kit_usage(org, period_start, period_end, 'hepatitis b')


def compute_I_PHD_1_5D(org, period_start, period_end):
    """Hepatitis C Screening Kits. Target: 176 boxes"""
    return _compute_kit_usage(org, period_start, period_end, 'hepatitis c')


def compute_I_PHD_1_5E(org, period_start, period_end):
    """HIV Screening Kits. Target: 70 boxes"""
    return _compute_kit_usage(org, period_start, period_end, 'hiv screening')


def compute_I_PHD_1_6(org, period_start, period_end):
    """HIV/STI positive cases linked to treatment. Target: 190"""
    positive_clients = HIVSTITestResult.objects.filter(
        organisation=org, approval_status=APPROVED,
        testing_date__range=(period_start, period_end),
    ).filter(
        Q(hiv_result='positive') | Q(syphilis_result='positive')
    ).values_list('client_id', flat=True)

    return Referral.objects.filter(
        organisation=org, approval_status=APPROVED,
        client_id__in=positive_clients,
        outcome='completed',
    ).values('client').distinct().count()


def compute_I_PHD_1_7(org):
    """Functional SRHR service centres. Target: 9"""
    return ServiceCenter.objects.filter(organisation=org, is_active=True).count()


def compute_I_PHD_1_8(org, period_start, period_end):
    """Mobile health camps conducted. Target: 40"""
    return MobileHealthCamp.objects.filter(
        organisation=org, approval_status=APPROVED,
        camp_date__range=(period_start, period_end),
    ).count()


def compute_I_PHD_1_9(org):
    """Brothels covered. Target: 11"""
    return ServiceCenter.objects.filter(
        organisation=org, is_active=True, center_type='BROTHEL'
    ).count()


def compute_I_PHD_2_1(org, period_start, period_end):
    """DGFP managers + GOB district staff oriented. Combined legacy
    function — kept for back-compat. New code paths split into 2.1a / 2.1b
    below to match the SIDA fixture (target 33 + 140 = two separate rows)."""
    return TrainingEvent.objects.filter(
        organisation=org, approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type__in=['HM', 'GOB'],
        event_type='orientation',
    ).aggregate(t=Sum('total_participants'))['t'] or 0


def compute_I_PHD_2_1A(org, period_start, period_end):
    """DGFP managers oriented (HM participants only). Target: 33."""
    return TrainingEvent.objects.filter(
        organisation=org, approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type='HM',
        event_type='orientation',
    ).aggregate(t=Sum('total_participants'))['t'] or 0


def compute_I_PHD_2_1B(org, period_start, period_end):
    """District / Upazila GOB staff oriented. Target: 140."""
    return TrainingEvent.objects.filter(
        organisation=org, approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type='GOB',
        event_type='orientation',
    ).aggregate(t=Sum('total_participants'))['t'] or 0


def compute_I_PHD_2_2(org, period_start, period_end):
    """MAs/Midwives trained. Target: 10"""
    return TrainingEvent.objects.filter(
        organisation=org, approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type='MW',
        event_type='training',
    ).aggregate(t=Sum('total_participants'))['t'] or 0


def compute_I_PHD_2_3(org, period_start, period_end):
    """Peer Educators trained. Target: 33"""
    return TrainingEvent.objects.filter(
        organisation=org, approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type='PE',
    ).aggregate(t=Sum('total_participants'))['t'] or 0


def compute_I_PHD_2_4(org, period_start, period_end):
    """Coordination meetings conducted. Target: 18"""
    return CoordMeeting.objects.filter(
        organisation=org, approval_status=APPROVED,
        meeting_date__range=(period_start, period_end),
    ).count()


def compute_phd_overall(org):
    """PHD obj=0 'Brothels covered' overall indicator.

    Per Step 3 spec: a static count of ServiceCenter rows where
    organisation='PHD' and is_active=True. Not a Kobo form count — this
    reflects the centre registry the supervisor maintains directly.
    """
    return ServiceCenter.objects.filter(organisation=org, is_active=True).count()


# ─── Objective 3 — Community Awareness (IEC materials) ────────────────────────
#
# All four obj-3 indicators count IECMaterial rows filtered by material_type.
# IECMaterial (audit FIX 12.2) is partner-scoped via the partner FK; this
# compute filters by `organisation='PHD'` for parity with the rest of the
# file. Quantity column is summed because the targets are in pcs.

def _compute_iec_by_type(org, period_start, period_end, mat_type: str) -> int:
    return IECMaterial.objects.filter(
        organisation=org, approval_status=APPROVED,
        date_distributed__range=(period_start, period_end),
        material_type=mat_type,
    ).aggregate(t=Sum('quantity'))['t'] or 0


def compute_I_PHD_3_1A(org, period_start, period_end):
    """Message boards installed. Target: 66 pcs."""
    return _compute_iec_by_type(org, period_start, period_end, IECMaterial.MESSAGE_BOARD)


def compute_I_PHD_3_1B(org, period_start, period_end):
    """Posters installed. Target: 200 pcs."""
    return _compute_iec_by_type(org, period_start, period_end, IECMaterial.POSTER)


def compute_I_PHD_3_1C(org, period_start, period_end):
    """Signboards installed. Target: 11 pcs."""
    return _compute_iec_by_type(org, period_start, period_end, IECMaterial.SIGNBOARD)


def compute_I_PHD_3_1D(org, period_start, period_end):
    """Billboards installed. Target: 11 pcs."""
    return _compute_iec_by_type(org, period_start, period_end, IECMaterial.BILLBOARD)


# ─── Activity-code registry ──────────────────────────────────────────────────
#
# Maps the canonical `activity_code` values from the IndicatorTarget fixture
# (data migration 0004_load_target_fixtures) to compute functions above.
#
# Every PHD indicator now has a compute function — the previous gaps at
# 3.1a-d (IEC materials) closed when the IECMaterial model landed in
# Commit 2. Quantity is summed per material_type for the four obj-3 rows.

ACTIVITY_REGISTRY = {
    'OVERALL': compute_phd_overall,    # org-only, no period
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
    '1.7':  compute_I_PHD_1_7,         # org-only, no period
    '1.8':  compute_I_PHD_1_8,
    '2.1a': compute_I_PHD_2_1A,
    '2.1b': compute_I_PHD_2_1B,
    '2.2':  compute_I_PHD_2_2,
    '2.3':  compute_I_PHD_2_3,
    '2.4':  compute_I_PHD_2_4,
    '3.1a': compute_I_PHD_3_1A,
    '3.1b': compute_I_PHD_3_1B,
    '3.1c': compute_I_PHD_3_1C,
    '3.1d': compute_I_PHD_3_1D,
}

# Codes whose compute function takes only (org) — no period args.
ORG_ONLY_CODES = {'OVERALL', '1.7'}
