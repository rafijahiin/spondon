"""
Bandhu (SOGIEC) indicator compute functions.
All filter on approval_status='APPROVED' only.
Period args: period_start, period_end are date objects.
"""
from django.db.models import Q, Sum
from programs.models import (
    ClinicVisit, HIVSTITestResult, HTCCounselling,
    IndividualCounselling, GroupEducationSession, OutreachSession,
    GBVCase, Referral, ServiceCenter, TrainingEvent, CoordMeeting, MobileHealthCamp,
    IECMaterial,
)

ORG = 'Bandhu'
APPROVED = 'APPROVED'


def compute_I_BND_1_1(org, period_start, period_end):
    """KP individuals receiving HIV/STI screening + FP counselling. Target: 4,000"""
    clinic_clients = ClinicVisit.objects.filter(
        organisation=org, approval_status=APPROVED,
        visit_date__range=(period_start, period_end),
    ).filter(
        Q(hiv_screening_done=True) | Q(sti_screening_done=True)
    ).values_list('client_id', flat=True).distinct()

    htc_clients = HTCCounselling.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).values_list('client_id', flat=True).distinct()

    all_client_ids = set(list(clinic_clients) + list(htc_clients))
    return len(all_client_ids)


def compute_I_BND_1_2(org, period_start, period_end):
    """GBV survivors screened and referred. Target: 120 (MIS doc)."""
    return GBVCase.objects.filter(
        organisation=org, approval_status=APPROVED,
        incident_date__range=(period_start, period_end),
    ).count()


def compute_I_BND_1_3(org, period_start, period_end):
    """Individuals receiving MHPSS counselling. Target: 48 persons (MIS doc)."""
    individual = IndividualCounselling.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
        issue_psychosocial=True,
    ).count()
    group_mh = GroupEducationSession.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
        topic__icontains='mental',
    ).count()
    return individual + group_mh


def compute_I_BND_1_4A(org, period_start, period_end):
    """Outreach + health-education sessions conducted. Target: 480 (MIS doc).

    Counts both the daily outreach monitoring submissions (OutreachSession,
    F-04) and any group health-education sessions (GroupEducationSession) —
    each row is one session conducted."""
    outreach = OutreachSession.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).count()
    group = GroupEducationSession.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).count()
    return outreach + group


# NOTE: indicator 1.4b ("KP reached via outreach", 4,000) was retired per the
# framework review — it duplicated 1.1 (KP receiving services, also 4,000).
# Only 1.4a (outreach sessions conducted) remains for the outreach activity.


def compute_I_BND_1_5_hiv(org, period_start, period_end):
    """KP receiving HIV testing services. Target: 2,000 (MIS doc, code 1.5b).

    Counts HIV test records from the HTC Service Register (F-06)."""
    return HIVSTITestResult.objects.filter(
        organisation=org, approval_status=APPROVED,
        testing_date__range=(period_start, period_end),
    ).count()


def compute_I_BND_1_5_sti(org, period_start, period_end):
    """KP receiving STI services. Target: 2,000 (MIS doc, code 1.5a).

    Counts clinic visits where an STI service was delivered (Patient Record
    Register F-05). Proxy on sti_screening_done until the register's
    STI-case fields are wired in P1."""
    return ClinicVisit.objects.filter(
        organisation=org, approval_status=APPROVED,
        visit_date__range=(period_start, period_end),
        sti_screening_done=True,
    ).count()


def compute_I_BND_1_6(org):
    """KP clinic (Dhaka). Target: 1"""
    return ServiceCenter.objects.filter(
        organisation=org, is_active=True, district__icontains='Dhaka'
    ).count()


def compute_I_BND_1_7(org, period_start, period_end):
    """KP referred and linked to ART/treatment. Target: 25 (MIS doc)."""
    return Referral.objects.filter(
        organisation=org, approval_status=APPROVED,
        referral_date__range=(period_start, period_end),
        referral_type__in=['art', 'hiv', 'sti_kp'],
        outcome='completed',
    ).values('client').distinct().count()


def compute_I_BND_1_8(org):
    """Community-friendly drop-in centres established/strengthened.
    Target: 8 (MIS doc — one per project district)."""
    return ServiceCenter.objects.filter(
        organisation=org, is_active=True, center_type='DIC'
    ).count()


def compute_I_BND_1_9(org, period_start, period_end):
    """Mobile outreach health camps conducted. Target: 40 camps (MIS doc).

    Counts camp events (rows), not individuals served — the indicator unit
    is camps."""
    return MobileHealthCamp.objects.filter(
        organisation=org, approval_status=APPROVED,
        camp_date__range=(period_start, period_end),
    ).count()


def compute_I_BND_2_1(org, period_start, period_end):
    """Health managers oriented. Target: 150"""
    return TrainingEvent.objects.filter(
        organisation=org, approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type__in=['HM', 'GOB'],
        event_type='orientation',
    ).aggregate(t=Sum('total_participants'))['t'] or 0


def compute_I_BND_2_2(org, period_start, period_end):
    """Midwives/frontline providers trained. Target: 150"""
    return TrainingEvent.objects.filter(
        organisation=org, approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type='MW',
        event_type='training',
    ).aggregate(t=Sum('total_participants'))['t'] or 0


def compute_I_BND_2_3(org, period_start, period_end):
    """GOB coordination meetings. Target: 12"""
    return CoordMeeting.objects.filter(
        organisation=org, approval_status=APPROVED,
        meeting_date__range=(period_start, period_end),
        meeting_type='GOB',
    ).count()


def compute_I_BND_2_4(org, period_start, period_end):
    """CBO coordination meetings. Target: 10"""
    return CoordMeeting.objects.filter(
        organisation=org, approval_status=APPROVED,
        meeting_date__range=(period_start, period_end),
        meeting_type='CBO',
    ).count()


def compute_I_BND_2_5(org, period_start, period_end):
    """Community leaders/PEs trained. Target: 125"""
    return TrainingEvent.objects.filter(
        organisation=org, approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type__in=['PE', 'CL'],
    ).aggregate(t=Sum('total_participants'))['t'] or 0


def compute_I_BND_2_6(org, period_start, period_end):
    """Day-observance / awareness events supported. Target: 2.

    Counts CoordMeeting rows of type DAY_OBSERVANCE (added in audit FIX 12.4).
    World AIDS Day, Hijra Pride, Human Rights Day, etc. all flow through
    this single meeting_type so the indicator has one clean source."""
    return CoordMeeting.objects.filter(
        organisation=org, approval_status=APPROVED,
        meeting_date__range=(period_start, period_end),
        meeting_type=CoordMeeting.DAY_OBSERVANCE,
    ).count()


def compute_I_BND_4_1(org, period_start, period_end):
    """IEC/SBCC materials distributed. Target: 50,000.

    Now reads from IECMaterial (audit FIX 12.2 added the model) plus the
    legacy outreach/clinic counts so historical rows from before the
    workshop still contribute. The IECMaterial path is the canonical one
    going forward."""
    iec = IECMaterial.objects.filter(
        organisation=org, approval_status=APPROVED,
        date_distributed__range=(period_start, period_end),
        material_type__in=[
            IECMaterial.LEAFLET, IECMaterial.POSTER, IECMaterial.MESSAGE_BOARD,
            IECMaterial.SIGNBOARD, IECMaterial.OTHER,
        ],
    ).aggregate(t=Sum('quantity'))['t'] or 0

    outreach = OutreachSession.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).aggregate(t=Sum('iec_bcc_materials_distributed'))['t'] or 0

    clinic = ClinicVisit.objects.filter(
        organisation=org, approval_status=APPROVED,
        visit_date__range=(period_start, period_end),
    ).aggregate(t=Sum('condoms_distributed'))['t'] or 0

    return iec + outreach + clinic


def compute_I_BND_4_2(org, period_start, period_end):
    """Public messaging displays installed. Target: 56 (MIS doc, code 4.2 —
    40 printed billboards + 16 e-billboards).

    The framework lists displays as ONE indicator, so this sums both the
    printed (BILLBOARD) and digital (DIGITAL) IEC material types."""
    return IECMaterial.objects.filter(
        organisation=org, approval_status=APPROVED,
        date_distributed__range=(period_start, period_end),
        material_type__in=[IECMaterial.BILLBOARD, IECMaterial.DIGITAL],
    ).aggregate(t=Sum('quantity'))['t'] or 0


# ─── Activity-code registry ──────────────────────────────────────────────────
#
# Maps the canonical `activity_code` from IndicatorTarget rows (set by data
# migration 0004_load_target_fixtures) to the compute function above.
#
# Codes absent from this registry are treated as UNLINKED by the service
# layer — the row still renders on the org page with achievement=0 and a
# small "module not built yet" badge, never a crash.
#
# Every Bandhu indicator now has a compute function — the previous gaps
# at 2.6 (day observance) and 4.3 (e-billboards) closed when the
# DAY_OBSERVANCE meeting type and IECMaterial model landed in Commits 1
# and 2 respectively.

ACTIVITY_REGISTRY = {
    '1.1':  compute_I_BND_1_1,
    '1.2':  compute_I_BND_1_2,
    '1.3':  compute_I_BND_1_3,
    '1.4a': compute_I_BND_1_4A,
    '1.5a': compute_I_BND_1_5_sti,      # STI services (clinic)
    '1.5b': compute_I_BND_1_5_hiv,      # HIV testing (HTC register)
    '1.6':  compute_I_BND_1_6,          # org-only, no period
    '1.7':  compute_I_BND_1_7,
    '1.8':  compute_I_BND_1_8,          # org-only, no period
    '1.9':  compute_I_BND_1_9,
    '2.1':  compute_I_BND_2_1,
    '2.2':  compute_I_BND_2_2,
    '2.3':  compute_I_BND_2_3,
    '2.4':  compute_I_BND_2_4,
    '2.5':  compute_I_BND_2_5,
    '2.6':  compute_I_BND_2_6,
    '4.1':  compute_I_BND_4_1,
    '4.2':  compute_I_BND_4_2,
}

# Codes whose compute function takes only (org) — no period args.
ORG_ONLY_CODES = {'1.6', '1.8'}
