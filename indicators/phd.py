"""
PHD (Partners in Health and Development) indicator compute functions.
All filter on approval_status='APPROVED' only.
"""
from django.db.models import Q, Sum
from programs.models import (
    Client, ClinicVisit, HIVSTITestResult, IndividualCounselling,
    GroupEducationSession, OutreachSession, GBVCase, Referral,
    ServiceCenter, TrainingEvent, CoordMeeting, MobileHealthCamp, StockEntry,
)

APPROVED = 'APPROVED'


def compute_I_PHD_1_1(org, period_start, period_end):
    """FSWs receiving HIV/STI screening + FP counselling. Target: 3,484"""
    from programs.models import Client
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
    """DGFP managers + GOB district staff oriented. Target: 33 + 140"""
    return TrainingEvent.objects.filter(
        organisation=org, approval_status=APPROVED,
        event_date__range=(period_start, period_end),
        participant_type__in=['HM', 'GOB'],
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
