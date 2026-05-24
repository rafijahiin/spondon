"""
Programs API views.

Organisation filtering:
  - super_admin / developer (can_see_all_orgs) → no org filter
  - manager → filtered to their own org

Approval:
  POST /<model>/<pk>/approve/  or  POST /<model>/<pk>/reject/
  Only managers (of the same org) and super_admins can approve/reject.
"""
import json
import logging

import requests as _requests
from django.conf import settings as _settings
from django.db import transaction as _tx
from django.utils import timezone
from rest_framework import viewsets, views, status
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


def _send_approval_telegram(org: str, form_label: str, reviewer_name: str, approved: bool, reason: str = '') -> None:
    """
    Notify the org's Telegram chat when a programs submission is approved/rejected.
    Field workers and managers are in the same org group chat.
    """
    token = getattr(_settings, 'TELEGRAM_BOT_TOKEN', '')
    if not token:
        return
    try:
        chat_ids = json.loads(getattr(_settings, 'TELEGRAM_CHAT_IDS', '{}'))
    except Exception:
        return
    chat_id = chat_ids.get(org)
    if not chat_id:
        return
    if approved:
        text = (
            f'<b>✅ Submission Approved</b>\n\n'
            f'Organisation: {org}\n'
            f'Form: {form_label}\n'
            f'Approved by: {reviewer_name}'
        )
    else:
        text = (
            f'<b>❌ Submission Rejected</b>\n\n'
            f'Organisation: {org}\n'
            f'Form: {form_label}\n'
            f'Rejected by: {reviewer_name}'
            + (f'\nReason: {reason}' if reason else '')
        )
    try:
        _requests.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'},
            timeout=5,
        ).raise_for_status()
    except Exception as exc:
        logger.error('Programs approval Telegram error: %s', exc)


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
        user = request.user
        with _tx.atomic():
            try:
                obj = self.get_queryset().select_for_update().get(pk=pk)
            except Exception:
                return Response({'detail': 'Record not found.'}, status=status.HTTP_404_NOT_FOUND)

            can_approve = (
                user.role in ('super_admin', 'developer') or
                (user.role == 'manager' and obj.organisation == user.organisation)
            )
            if not can_approve:
                return Response({'detail': 'Not authorised.'}, status=status.HTTP_403_FORBIDDEN)

            if obj.approval_status != 'PENDING':
                return Response(
                    {'status': obj.approval_status, 'detail': 'Already processed.'},
                    status=status.HTTP_409_CONFLICT,
                )

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


# ─── Aggregated Pending Approvals ──────────────────────────────────────────────

def _build_summary(obj, model_type: str) -> str:
    """Build a human-readable one-line summary for each model type."""
    try:
        if model_type == 'clinic_visit':
            parts = [f"Visit {obj.visit_date}"]
            if obj.hiv_screening_done: parts.append('HIV screen')
            if obj.sti_screening_done: parts.append('STI screen')
            if obj.condoms_distributed: parts.append(f'Condoms: {obj.condoms_distributed}')
            return ' · '.join(parts)
        if model_type == 'hiv_sti_result':
            return f"Test {obj.testing_date} · HIV: {obj.hiv_result} · Syphilis: {obj.syphilis_result}"
        if model_type == 'adr_record':
            return f"ADR {obj.report_date} · Effect: {'Yes' if obj.adverse_effect_present else 'No'}"
        if model_type == 'autoclave_log':
            return f"{obj.log_type.title()} log {obj.log_date}"
        if model_type == 'antenatal_card':
            return f"ANC Visit #{obj.anc_visit_number} · {obj.visit_date} · Trimester: {obj.trimester or '–'}"
        if model_type == 'htc_counselling':
            return f"HTC {obj.session_type} · {obj.session_date}"
        if model_type == 'individual_counselling':
            issues = [k.replace('issue_', '') for k in [
                'issue_sti', 'issue_psychosocial', 'issue_gbv', 'issue_drug_use', 'issue_fp'
            ] if getattr(obj, k, False)]
            return f"Counselling {obj.session_date}" + (f" · {', '.join(issues)}" if issues else '')
        if model_type == 'mh_screening':
            return f"{obj.screening_type.title()} screening {obj.screening_date} · {obj.severity_category or 'pending score'}"
        if model_type == 'gbv_case':
            types = [t for t, f in [('Sexual', 'gbv_sexual'), ('Physical', 'gbv_physical'),
                                      ('Economic', 'gbv_economic'), ('Psychological', 'gbv_psychological')]
                     if getattr(obj, f, False)]
            return f"GBV case {obj.incident_date}" + (f" · {', '.join(types)}" if types else '')
        if model_type == 'outreach_session':
            return f"Outreach {obj.session_date} · {obj.individual_contacts} contacts · {obj.condoms_distributed_free} condoms"
        if model_type == 'group_education':
            return f"Group session {obj.session_date} · {obj.topic[:40]} · {obj.participant_count} participants"
        if model_type == 'referral':
            return f"Referral {obj.referral_date} → {obj.referred_to[:40]} · {obj.referral_type} · {obj.outcome}"
        if model_type == 'safety_hygiene_kit':
            return f"Kit distribution {obj.distribution_date} · {obj.condom_count} condoms"
        if model_type == 'training_event':
            return f"{obj.event_type.title()} {obj.event_date} · {obj.participant_type} · {obj.total_participants} participants"
        if model_type == 'coord_meeting':
            return f"{obj.meeting_type} meeting {obj.meeting_date} · {obj.participant_count} attendees"
        if model_type == 'mobile_camp':
            return f"Mobile camp {obj.camp_date} · {obj.clients_served} clients · {obj.brothel_name or obj.center}"
        if model_type == 'client_reg':
            parts = [f"Client ID: {obj.client_id}", obj.name or '–']
            if obj.target_group_code:
                parts.append(obj.get_target_group_code_display())
            if obj.enrolled_date:
                parts.append(f"Enrolled: {obj.enrolled_date}")
            return ' · '.join(parts)
    except Exception as exc:
        logger.warning('_build_summary(%s, pk=%s): %s', model_type, getattr(obj, 'id', '?'), exc)
    return f"{model_type.replace('_', ' ').title()} record"


def _pending_for_model(queryset, model_type: str, org_filter_org=None):
    """Return list of pending approval dicts for a given queryset."""
    qs = queryset.filter(approval_status='PENDING').select_related('center', 'approved_by')
    if org_filter_org:
        qs = qs.filter(organisation=org_filter_org)
    results = []
    for obj in qs.order_by('created_at')[:200]:
        results.append({
            'id': str(obj.id),
            'model_type': model_type,
            'model_label': model_type.replace('_', ' ').title(),
            'endpoint': model_type.replace('_', '-') + 's',
            'organisation': obj.organisation,
            'approval_status': obj.approval_status,
            'submitted_by': obj.submitted_by_kobo_user or '–',
            'center_name': obj.center.name if obj.center_id else '–',
            'center_code': obj.center.code if obj.center_id else '',
            'created_at': obj.created_at.isoformat(),
            'summary': _build_summary(obj, model_type),
            'latitude': float(obj.latitude) if obj.latitude else None,
            'longitude': float(obj.longitude) if obj.longitude else None,
            'kobo_submission_id': obj.kobo_submission_id or '',
        })
    return results


# endpoint → (queryset, model_type)
_APPROVAL_MODELS = [
    ('client_reg',           lambda: Client.objects),
    ('clinic_visit',         lambda: ClinicVisit.objects),
    ('hiv_sti_result',       lambda: HIVSTITestResult.objects),
    ('adr_record',           lambda: ADRRecord.objects),
    ('autoclave_log',        lambda: AutoclaveLog.objects),
    ('antenatal_card',       lambda: AntenatalCard.objects),
    ('htc_counselling',      lambda: HTCCounselling.objects),
    ('individual_counselling', lambda: IndividualCounselling.objects),
    ('mh_screening',         lambda: MHScreening.objects),
    ('gbv_case',             lambda: GBVCase.objects),
    ('outreach_session',     lambda: OutreachSession.objects),
    ('group_education',      lambda: GroupEducationSession.objects),
    ('referral',             lambda: Referral.objects),
    ('safety_hygiene_kit',   lambda: SafetyHygieneKit.objects),
    ('training_event',       lambda: TrainingEvent.objects),
    ('coord_meeting',        lambda: CoordMeeting.objects),
    ('mobile_camp',          lambda: MobileHealthCamp.objects),
]

# Fix endpoint slugs for DRF router (plural URLs)
_ENDPOINT_OVERRIDES = {
    'client_reg': 'clients',
    'clinic_visit': 'clinic-visits',
    'hiv_sti_result': 'hiv-sti-results',
    'adr_record': 'adr-records',
    'autoclave_log': 'autoclave-logs',
    'antenatal_card': 'antenatal-cards',
    'htc_counselling': 'htc-counselling',
    'individual_counselling': 'individual-counselling',
    'mh_screening': 'mh-screening',
    'gbv_case': 'gbv-cases',
    'outreach_session': 'outreach-sessions',
    'group_education': 'group-education',
    'referral': 'referrals',
    'safety_hygiene_kit': 'hygiene-kits',
    'training_event': 'training-events',
    'coord_meeting': 'coord-meetings',
    'mobile_camp': 'mobile-camps',
}


class PendingApprovalsView(views.APIView):
    """
    GET  /api/programs/pending-approvals/
    Returns all pending programs submissions across all model types.
    Org-filtered per user role.

    POST /api/programs/pending-approvals/
    Body: { id, model_type, action: "approve"|"reject", reason: "" }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        org = None if user.can_see_all_orgs else user.organisation

        all_pending = []
        for model_type, qs_fn in _APPROVAL_MODELS:
            items = _pending_for_model(qs_fn(), model_type, org)
            for item in items:
                item['endpoint'] = _ENDPOINT_OVERRIDES.get(model_type, model_type + 's')
            all_pending.extend(items)

        # Sort by created_at ascending (oldest first)
        all_pending.sort(key=lambda x: x['created_at'])

        # Summary counts by model_type
        counts = {}
        for item in all_pending:
            counts[item['model_type']] = counts.get(item['model_type'], 0) + 1

        return Response({
            'total': len(all_pending),
            'counts_by_type': counts,
            'items': all_pending,
        })

    def post(self, request):
        """Approve or reject a single pending item."""
        pk = request.data.get('id')
        model_type = request.data.get('model_type')
        action_type = request.data.get('action')  # 'approve' or 'reject'
        reason = request.data.get('reason', '')

        if not all([pk, model_type, action_type]):
            return Response({'detail': 'id, model_type, and action are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Find the model manager
        model_mgr = None
        for mt, qs_fn in _APPROVAL_MODELS:
            if mt == model_type:
                model_mgr = qs_fn()
                break

        if model_mgr is None:
            return Response({'detail': f'Unknown model_type: {model_type}'}, status=status.HTTP_400_BAD_REQUEST)

        with _tx.atomic():
            try:
                obj = model_mgr.select_for_update().get(id=pk)
            except Exception:
                return Response({'detail': 'Record not found.'}, status=status.HTTP_404_NOT_FOUND)

            user = request.user
            can_approve = (
                user.role in ('super_admin', 'developer') or
                (user.role == 'manager' and obj.organisation == user.organisation)
            )
            if not can_approve:
                return Response({'detail': 'Not authorised.'}, status=status.HTTP_403_FORBIDDEN)

            if obj.approval_status != 'PENDING':
                return Response(
                    {'status': obj.approval_status, 'detail': 'Already processed.'},
                    status=status.HTTP_409_CONFLICT,
                )

            if action_type == 'approve':
                obj.approval_status = 'APPROVED'
                obj.approved_by = user
                obj.approved_at = timezone.now()
                obj.rejected_reason = ''
            elif action_type == 'reject':
                obj.approval_status = 'REJECTED'
                obj.rejected_reason = reason
            else:
                return Response({'detail': "action must be 'approve' or 'reject'."}, status=status.HTTP_400_BAD_REQUEST)

            obj.save()

        # Telegram — notify org chat of approval/rejection
        try:
            from .webhook import _FORM_LABELS, FORM_HANDLERS
            # Reverse-look up form label from model_type
            _model_to_form = {
                'client_reg': 'spondon_client_reg_v1',
                'clinic_visit': 'spondon_clinic_visit_v1',
                'hiv_sti_result': 'spondon_hiv_sti_test_v1',
                'adr_record': 'spondon_adr_record_v1',
                'autoclave_log': 'spondon_autoclave_log_v1',
                'antenatal_card': 'spondon_antenatal_card_v1',
                'htc_counselling': 'spondon_htc_counsel_v1',
                'individual_counselling': 'spondon_counselling_v1',
                'mh_screening': 'spondon_mh_screening_v1',
                'gbv_case': 'spondon_gbv_case_v1',
                'outreach_session': 'spondon_outreach_v1',
                'group_education': 'spondon_group_edu_v1',
                'referral': 'spondon_referral_v1',
                'safety_hygiene_kit': 'spondon_hygiene_kit_v1',
                'training_event': 'spondon_training_event_v1',
                'coord_meeting': 'spondon_coord_meeting_v1',
                'mobile_camp': 'spondon_mobile_camp_v1',
            }
            form_key = _model_to_form.get(model_type, '')
            form_label = _FORM_LABELS.get(form_key, model_type.replace('_', ' ').title())
            reviewer_name = getattr(user, 'full_name', None) or user.email
            _send_approval_telegram(
                org=obj.organisation,
                form_label=form_label,
                reviewer_name=reviewer_name,
                approved=(action_type == 'approve'),
                reason=reason,
            )
        except Exception as exc:
            logger.error('Telegram notification failed after approval: %s', exc)

        return Response({'status': obj.approval_status, 'id': str(obj.id)})
