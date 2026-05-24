"""
Programs API views.

Organisation filtering:
  - super_admin / developer (can_see_all_orgs) → no org filter
  - manager → filtered to their own org

Approval:
  POST /<model>/<pk>/approve/  or  POST /<model>/<pk>/reject/
  Only managers (of the same org) and super_admins can approve/reject.
"""
import logging
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import (
    ServiceCenter, Client,
    ClinicVisit, HIVSTITestResult, ADRRecord, AutoclaveLog, AntenatalCard,
    HTCCounselling, IndividualCounselling, MHScreening,
    GBVCase, GBVAccessLog,
    OutreachSession, GroupEducationSession,
    Referral,
    StockEntry, TemperatureLog, SafetyHygieneKit, StoreRequisition,
    TrainingEvent, CoordMeeting, MobileHealthCamp, VisitorRegister,
)
from .serializers import (
    ServiceCenterSerializer, ClientSerializer,
    ClinicVisitSerializer, ClinicVisitApprovalSerializer,
    HIVSTITestResultSerializer, ADRRecordSerializer,
    AutoclaveLogSerializer, AntenatalCardSerializer,
    HTCCounsellingSerializer, IndividualCounsellingSerializer, MHScreeningSerializer,
    GBVCaseSerializer, GBVCaseDetailSerializer,
    OutreachSessionSerializer, GroupEducationSessionSerializer,
    ReferralSerializer, ReferralOutcomeSerializer,
    StockEntrySerializer, TemperatureLogSerializer,
    SafetyHygieneKitSerializer, StoreRequisitionSerializer,
    TrainingEventSerializer, CoordMeetingSerializer,
    MobileHealthCampSerializer, VisitorRegisterSerializer,
)

logger = logging.getLogger(__name__)


def _org_filter(queryset, request):
    """Apply organisation filter based on user permissions."""
    user = request.user
    if not user.can_see_all_orgs:
        queryset = queryset.filter(organisation=user.organisation)
    return queryset


class OrgFilteredViewSet(viewsets.ModelViewSet):
    """Base viewset that filters by org and handles approval actions."""
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _org_filter(super().get_queryset(), self.request)

    def _approve_or_reject(self, request, pk, action_type):
        obj = self.get_object()
        user = request.user

        can_approve = (
            user.role in ('super_admin', 'developer') or
            (user.role == 'manager' and obj.organisation == user.organisation)
        )
        if not can_approve:
            return Response({'detail': 'Not authorised.'}, status=status.HTTP_403_FORBIDDEN)

        if action_type == 'approve':
            obj.approval_status = 'APPROVED'
            obj.approved_by = user
            obj.approved_at = timezone.now()
            obj.rejected_reason = ''
        else:
            reason = request.data.get('reason', '')
            obj.approval_status = 'REJECTED'
            obj.rejected_reason = reason

        obj.save()
        return Response({'status': obj.approval_status})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._approve_or_reject(request, pk, 'approve')

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._approve_or_reject(request, pk, 'reject')

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == 'manager':
            serializer.save(organisation=user.organisation)
        else:
            serializer.save()


# ─── Service Centres ───────────────────────────────────────────────────────────

class ServiceCenterViewSet(viewsets.ModelViewSet):
    queryset = ServiceCenter.objects.all()
    serializer_class = ServiceCenterSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _org_filter(ServiceCenter.objects.filter(is_active=True), self.request)


# ─── Clients ───────────────────────────────────────────────────────────────────

class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.select_related('center').all()
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _org_filter(Client.objects.select_related('center').all(), self.request)


# ─── Clinic ────────────────────────────────────────────────────────────────────

class ClinicVisitViewSet(OrgFilteredViewSet):
    queryset = ClinicVisit.objects.select_related('client', 'center', 'approved_by').all()
    serializer_class = ClinicVisitSerializer

    def get_queryset(self):
        qs = ClinicVisit.objects.select_related('client', 'center', 'approved_by').all()
        qs = _org_filter(qs, self.request)
        approval = self.request.query_params.get('approval_status')
        if approval:
            qs = qs.filter(approval_status=approval)
        return qs.order_by('-visit_date')


class HIVSTITestResultViewSet(OrgFilteredViewSet):
    queryset = HIVSTITestResult.objects.select_related('client', 'center').all()
    serializer_class = HIVSTITestResultSerializer


class ADRRecordViewSet(OrgFilteredViewSet):
    queryset = ADRRecord.objects.select_related('client', 'center').all()
    serializer_class = ADRRecordSerializer


class AutoclaveLogViewSet(OrgFilteredViewSet):
    queryset = AutoclaveLog.objects.select_related('center').all()
    serializer_class = AutoclaveLogSerializer


class AntenatalCardViewSet(OrgFilteredViewSet):
    queryset = AntenatalCard.objects.select_related('client', 'center').all()
    serializer_class = AntenatalCardSerializer


# ─── Counselling ───────────────────────────────────────────────────────────────

class HTCCounsellingViewSet(OrgFilteredViewSet):
    queryset = HTCCounselling.objects.select_related('client', 'center').all()
    serializer_class = HTCCounsellingSerializer


class IndividualCounsellingViewSet(OrgFilteredViewSet):
    queryset = IndividualCounselling.objects.select_related('client', 'center').all()
    serializer_class = IndividualCounsellingSerializer


class MHScreeningViewSet(OrgFilteredViewSet):
    queryset = MHScreening.objects.select_related('client', 'center').all()
    serializer_class = MHScreeningSerializer


# ─── GBV ───────────────────────────────────────────────────────────────────────

class GBVCaseViewSet(OrgFilteredViewSet):
    queryset = GBVCase.objects.select_related('client', 'center', 'approved_by').all()

    def get_serializer_class(self):
        user = self.request.user
        if user.role in ('super_admin', 'developer') or getattr(user, 'is_gbv_officer', False):
            return GBVCaseDetailSerializer
        return GBVCaseSerializer

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        GBVAccessLog.objects.create(
            case=instance,
            user=request.user,
            action='VIEW',
            ip_address=request.META.get('REMOTE_ADDR', ''),
        )
        return super().retrieve(request, *args, **kwargs)


# ─── Outreach ──────────────────────────────────────────────────────────────────

class OutreachSessionViewSet(OrgFilteredViewSet):
    queryset = OutreachSession.objects.select_related('center').all()
    serializer_class = OutreachSessionSerializer


class GroupEducationSessionViewSet(OrgFilteredViewSet):
    queryset = GroupEducationSession.objects.select_related('center').all()
    serializer_class = GroupEducationSessionSerializer


# ─── Referrals ─────────────────────────────────────────────────────────────────

class ReferralViewSet(OrgFilteredViewSet):
    queryset = Referral.objects.select_related('client', 'center').all()
    serializer_class = ReferralSerializer

    @action(detail=True, methods=['patch'])
    def update_outcome(self, request, pk=None):
        """PATCH .../referrals/<pk>/update_outcome/ to update referral outcome."""
        obj = self.get_object()
        serializer = ReferralOutcomeSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(outcome_updated_by=request.user)
        return Response(serializer.data)


# ─── Supply ────────────────────────────────────────────────────────────────────

class StockEntryViewSet(OrgFilteredViewSet):
    queryset = StockEntry.objects.select_related('center').all()
    serializer_class = StockEntrySerializer

    def get_queryset(self):
        qs = StockEntry.objects.select_related('center').all()
        qs = _org_filter(qs, self.request)
        month = self.request.query_params.get('month')
        if month:
            qs = qs.filter(reporting_month=month)
        return qs


class TemperatureLogViewSet(OrgFilteredViewSet):
    queryset = TemperatureLog.objects.select_related('center').all()
    serializer_class = TemperatureLogSerializer


class SafetyHygieneKitViewSet(OrgFilteredViewSet):
    queryset = SafetyHygieneKit.objects.select_related('center').all()
    serializer_class = SafetyHygieneKitSerializer


class StoreRequisitionViewSet(OrgFilteredViewSet):
    queryset = StoreRequisition.objects.select_related('center').all()
    serializer_class = StoreRequisitionSerializer


# ─── Operations ────────────────────────────────────────────────────────────────

class TrainingEventViewSet(OrgFilteredViewSet):
    queryset = TrainingEvent.objects.select_related('center').all()
    serializer_class = TrainingEventSerializer


class CoordMeetingViewSet(OrgFilteredViewSet):
    queryset = CoordMeeting.objects.select_related('center').all()
    serializer_class = CoordMeetingSerializer


class MobileHealthCampViewSet(OrgFilteredViewSet):
    queryset = MobileHealthCamp.objects.select_related('center').all()
    serializer_class = MobileHealthCampSerializer


class VisitorRegisterViewSet(viewsets.ModelViewSet):
    queryset = VisitorRegister.objects.select_related('center').all()
    serializer_class = VisitorRegisterSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _org_filter(VisitorRegister.objects.select_related('center').all(), self.request)
