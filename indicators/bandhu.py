"""
Bandhu (SOGIEC) indicator compute functions.
All filter on approval_status='APPROVED' only.
Period args: period_start, period_end are date objects.
"""
from django.db.models import Q, Sum
from programs.models import (
    Client, ClinicVisit, HIVSTITestResult, HTCCounselling,
    IndividualCounselling, GroupEducationSession, OutreachSession,
    GBVCase, Referral, ServiceCenter, TrainingEvent, CoordMeeting, MobileHealthCamp,
)

ORG = 'Bondhu'
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
    """GBV survivors screened and referred. Target: 200"""
    return GBVCase.objects.filter(
        organisation=org, approval_status=APPROVED,
        incident_date__range=(period_start, period_end),
    ).count()


def compute_I_BND_1_3(org, period_start, period_end):
    """MHPSS counselling sessions. Target: 75"""
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
    """Group outreach/education sessions. Target: 400"""
    return GroupEducationSession.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).count()


def compute_I_BND_1_4B(org, period_start, period_end):
    """KP members reached via outreach. Target: 5,000"""
    outreach = OutreachSession.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).aggregate(t=Sum('individual_contacts'))['t'] or 0

    group = GroupEducationSession.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).aggregate(t=Sum('participant_count'))['t'] or 0

    return outreach + group


def compute_I_BND_1_5(org, period_start, period_end):
    """HIV/STI tests conducted. Target: 2,000"""
    return HIVSTITestResult.objects.filter(
        organisation=org, approval_status=APPROVED,
        testing_date__range=(period_start, period_end),
    ).count()


def compute_I_BND_1_5_centers(org):
    """SRHR service centres. Target: 5"""
    return ServiceCenter.objects.filter(organisation=org, is_active=True).count()


def compute_I_BND_1_6(org):
    """KP clinic (Dhaka). Target: 1"""
    return ServiceCenter.objects.filter(
        organisation=org, is_active=True, district__icontains='Dhaka'
    ).count()


def compute_I_BND_1_7(org, period_start, period_end):
    """KP referred and linked to ART/treatment. Target: 175"""
    return Referral.objects.filter(
        organisation=org, approval_status=APPROVED,
        referral_date__range=(period_start, period_end),
        referral_type__in=['art', 'hiv', 'sti_kp'],
        outcome='completed',
    ).values('client').distinct().count()


def compute_I_BND_1_8(org):
    """DICs established. Target: 5"""
    return ServiceCenter.objects.filter(
        organisation=org, is_active=True, center_type='DIC'
    ).count()


def compute_I_BND_1_9(org, period_start, period_end):
    """KP individuals reached via mobile outreach. Target: 200"""
    return MobileHealthCamp.objects.filter(
        organisation=org, approval_status=APPROVED,
        camp_date__range=(period_start, period_end),
    ).aggregate(t=Sum('clients_served'))['t'] or 0


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


def compute_I_BND_4_1(org, period_start, period_end):
    """IEC/SBCC materials distributed. Target: 50,000"""
    outreach = OutreachSession.objects.filter(
        organisation=org, approval_status=APPROVED,
        session_date__range=(period_start, period_end),
    ).aggregate(t=Sum('iec_bcc_materials_distributed'))['t'] or 0

    clinic = ClinicVisit.objects.filter(
        organisation=org, approval_status=APPROVED,
        visit_date__range=(period_start, period_end),
    ).aggregate(t=Sum('condoms_distributed'))['t'] or 0

    return outreach + clinic
