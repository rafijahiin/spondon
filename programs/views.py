"""
Programs API views.

Organisation filtering:
  - developer / supervisor (can_see_all_orgs) → no org filter
  - org_lead (can_read_other_orgs) → no filter (read-only on other partners)
  - manager / field_staff → filtered to their own org

Approval:
  POST /<model>/<pk>/approve/  or  POST /<model>/<pk>/reject/
  Only managers (of the same org), supervisors, developers, and org_leads
  (own partner only) can approve/reject.
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
from accounts.permissions import (
    CanWriteFieldRecord, CanWriteOutreach,
)

from .models import (
    ServiceCenter, Client,
    ClinicVisit, HIVSTITestResult, ADRRecord, AutoclaveLog, AntenatalCard,
    HTCCounselling, IndividualCounselling, MHScreening,
    GBVCase, GBVAccessLog,
    OutreachSession, GroupEducationSession,
    Referral,
    IECMaterial,
    StockEntry, TemperatureLog, SafetyHygieneKit, StoreRequisition,
    TrainingEvent, CoordMeeting, MobileHealthCamp, VisitorRegister,
    NilReport,
)
from .serializers import (
    ServiceCenterSerializer, ClientSerializer,
    ClinicVisitSerializer, HIVSTITestResultSerializer, ADRRecordSerializer,
    AutoclaveLogSerializer, AntenatalCardSerializer,
    HTCCounsellingSerializer, IndividualCounsellingSerializer, MHScreeningSerializer,
    GBVCaseSerializer, GBVCaseDetailSerializer,
    IECMaterialSerializer,
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


def _apply_decision(obj, user, action_type, reason):
    """Apply an approve/reject decision with the org-aware two-stage rules.

    Bandhu Service Log + Activity & Operations (and NilReport) are two-stage:
        PENDING --manager--> MANAGER_APPROVED --UNFPA--> APPROVED
    PHD / CIPRB are single-stage (PENDING --> APPROVED). Used by BOTH approval
    entrypoints (PendingApprovalsView and the per-model viewset action) so a
    Bandhu record can never bypass the UNFPA gate.

    Mutates `obj` in place on success and returns None; returns a DRF Response
    on any authorisation / state error (caller returns it as-is).
    """
    uorg = user.organisation
    is_unfpa = (uorg == 'UNFPA')
    is_super = bool(getattr(user, 'can_see_all_orgs', False)) and not is_unfpa
    if not user.can_approve_submissions:
        return Response({'detail': 'Not authorised.'}, status=status.HTTP_403_FORBIDDEN)
    if not (is_super or obj.organisation == uorg
            or (is_unfpa and obj.organisation == 'Bandhu')):
        return Response({'detail': 'Not authorised.'}, status=status.HTTP_403_FORBIDDEN)

    two_stage = (obj.organisation == 'Bandhu')
    cur = obj.approval_status
    now = timezone.now()

    if action_type == 'approve':
        if two_stage and cur == 'PENDING':
            if not (is_super or uorg == 'Bandhu'):
                return Response({'detail': 'Manager-stage approval is for the Bandhu manager.'},
                                status=status.HTTP_403_FORBIDDEN)
            obj.approval_status = 'MANAGER_APPROVED'
            obj.manager_approved_by = user
            obj.manager_approved_at = now
            obj.rejected_reason = ''
        elif two_stage and cur == 'MANAGER_APPROVED':
            if not (is_super or is_unfpa):
                return Response({'detail': 'Final approval is for UNFPA.'},
                                status=status.HTTP_403_FORBIDDEN)
            obj.approval_status = 'APPROVED'
            obj.approved_by = user
            obj.approved_at = now
            obj.rejected_reason = ''
        elif cur == 'PENDING':
            obj.approval_status = 'APPROVED'
            obj.approved_by = user
            obj.approved_at = now
            obj.rejected_reason = ''
        else:
            return Response({'status': cur, 'detail': 'Already processed.'},
                            status=status.HTTP_409_CONFLICT)
    elif action_type == 'reject':
        if not str(reason).strip():
            return Response({'detail': 'A reason is required to reject.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if two_stage and cur == 'MANAGER_APPROVED':
            if not (is_super or is_unfpa):
                return Response({'detail': 'Not authorised.'}, status=status.HTTP_403_FORBIDDEN)
            obj.approval_status = 'PENDING'
            obj.manager_approved_by = None
            obj.manager_approved_at = None
            obj.rejected_reason = reason
        elif cur == 'PENDING':
            obj.approval_status = 'REJECTED'
            obj.rejected_reason = reason
        else:
            return Response({'status': cur, 'detail': 'Already processed.'},
                            status=status.HTTP_409_CONFLICT)
    else:
        return Response({'detail': "action must be 'approve' or 'reject'."},
                        status=status.HTTP_400_BAD_REQUEST)
    return None


def _org_filter(queryset, request):
    """Apply organisation filter based on user permissions.

    Audit FIX 15.7 — field staff additionally restricted to own entries
    via the submitted_by FK on SubmissionBase. Models without a
    submitted_by field (ServiceCenter / Client) fall back to plain org
    isolation, which is correct — those are reference tables, not
    field-submitted records."""
    from accounts.models import Role
    user = request.user
    if user.can_see_all_orgs or user.can_read_other_orgs:
        return queryset
    queryset = queryset.filter(organisation=user.organisation)
    if user.role == Role.FIELD_STAFF:
        # Probe the model for submitted_by before filtering — keeps the
        # filter a no-op on reference tables that don't carry the FK.
        if any(f.name == 'submitted_by' for f in queryset.model._meta.get_fields()):
            queryset = queryset.filter(submitted_by=user)
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

            # Shared two-stage decision (Bandhu manager → UNFPA; PHD/CIPRB
            # single-stage). Defence-in-depth: same rules as the queue endpoint.
            reason = request.data.get('reason', '')
            err = _apply_decision(obj, user, action_type, reason)
            if err is not None:
                return err
            obj.save()

        # Email the partner's managers/focal + the submitter (resolved from
        # the User FK OR the raw_payload's email-shaped field) about the
        # decision. Rejection emails carry the Enketo collect link for the
        # same form so the worker can submit a corrected entry in one click.
        try:
            from submissions.email_notify import _recipients_for, _send
            label = obj._meta.verbose_name.title()
            recipients = _recipients_for(obj.organisation)
            # Worker notification: pull the email out of the User FK first,
            # then fall back to whatever the form captured in raw_payload.
            sub_email = getattr(getattr(obj, 'submitted_by', None), 'email', '') or ''
            if not sub_email:
                payload = getattr(obj, 'raw_payload', None) or {}
                for k in ('email', 'enumerator_email', 'submitter_email',
                          'your_email', 'respondent_email'):
                    v = str(payload.get(k, '') or '').strip()
                    if '@' in v:
                        sub_email = v
                        break
            if sub_email and sub_email not in recipients:
                recipients = recipients + [sub_email]
            if recipients:
                if obj.approval_status == 'APPROVED':
                    subj = f'[SIMPLE] ✓ {label} approved — {obj.organisation}'
                    body = (
                        f'A {label} submission for {obj.organisation} has been approved '
                        f'by {getattr(user, "full_name", "") or user.email}.'
                    )
                else:
                    # Resubmit link — for PHD models route to the new merged
                    # Service Log / Registration; for legacy partners we leave
                    # the link blank (their workflow predates this notifier).
                    resubmit = _program_resubmit_url(model_type, obj.organisation)
                    link_line = f'\nResubmit corrected entry: {resubmit}\n' if resubmit else ''
                    subj = f'[SIMPLE] ✗ {label} rejected — {obj.organisation}'
                    body = (
                        f'A {label} submission for {obj.organisation} was rejected '
                        f'by {getattr(user, "full_name", "") or user.email}.\n\n'
                        f'Reviewer note: {obj.rejected_reason or "No reason provided"}\n'
                        f'{link_line}\n'
                        f'Please open the form again, fix the flagged field, and submit '
                        f'a corrected entry. The rejected record is kept as the audit trail.'
                    )
                _send(subj, body, recipients)
        except Exception:
            pass

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
    permission_classes = [CanWriteFieldRecord]  # Clinic visit is field-staff data

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
    permission_classes = [CanWriteFieldRecord]


class ADRRecordViewSet(OrgFilteredViewSet):
    queryset = ADRRecord.objects.select_related('client', 'center').all()
    serializer_class = ADRRecordSerializer
    permission_classes = [CanWriteFieldRecord]


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
    permission_classes = [CanWriteFieldRecord]  # Field-staff write; manager blocked


class IndividualCounsellingViewSet(OrgFilteredViewSet):
    queryset = IndividualCounselling.objects.select_related('client', 'center').all()
    serializer_class = IndividualCounsellingSerializer
    permission_classes = [CanWriteFieldRecord]


class MHScreeningViewSet(OrgFilteredViewSet):
    queryset = MHScreening.objects.select_related('client', 'center').all()
    serializer_class = MHScreeningSerializer
    permission_classes = [CanWriteFieldRecord]


# ─── GBV ───────────────────────────────────────────────────────────────────────

class GBVCaseViewSet(OrgFilteredViewSet):
    queryset = GBVCase.objects.select_related('client', 'center', 'approved_by').all()
    permission_classes = [CanWriteFieldRecord]  # GBV is field-staff data

    def get_serializer_class(self):
        user = self.request.user
        if user.role in ('developer', 'supervisor', 'org_lead') or getattr(user, 'is_gbv_officer', False):
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
    permission_classes = [CanWriteOutreach]  # Manager-only write per handoff


class GroupEducationSessionViewSet(OrgFilteredViewSet):
    queryset = GroupEducationSession.objects.select_related('center').all()
    serializer_class = GroupEducationSessionSerializer
    permission_classes = [CanWriteOutreach]  # Community session — manager-only


# ─── IEC / SBCC materials ──────────────────────────────────────────────────────
#
# Feeds PHD 3.1a-d + Bandhu 4.1 / 4.3 indicators. CanWriteOutreach is the
# right permission class — IEC distribution is a community-facing activity
# the manager owns. Field staff get read-only via OrgFilterMixin filter.

class IECMaterialViewSet(OrgFilteredViewSet):
    queryset = IECMaterial.objects.select_related('center', 'partner').all()
    serializer_class = IECMaterialSerializer
    permission_classes = [CanWriteOutreach]

    def get_queryset(self):
        qs = super().get_queryset()
        material_type = self.request.query_params.get('material_type')
        if material_type:
            qs = qs.filter(material_type=material_type)
        return qs.order_by('-date_distributed', '-created_at')

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)


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
    permission_classes = [CanWriteOutreach]  # Mobile camp = community outreach


class VisitorRegisterViewSet(viewsets.ModelViewSet):
    queryset = VisitorRegister.objects.select_related('center').all()
    serializer_class = VisitorRegisterSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _org_filter(VisitorRegister.objects.select_related('center').all(), self.request)


# ─── Aggregated Pending Approvals ──────────────────────────────────────────────

# Resubmit-link map per (model_type, partner). Points the field worker
# at the Enketo form that produced the rejected record so they can submit
# a corrected entry without hunting for the right link. PHD: Form 1 for
# Client registrations, Form 2 (Service Log) for every other PHD model.
_PHD_REG_URL  = 'https://ee.kobotoolbox.org/x/NesXOMsL'
_PHD_LOG_URL  = 'https://ee.kobotoolbox.org/x/o7GhleIk'


def _program_resubmit_url(model_type: str, organisation: str) -> str:
    if organisation != 'PHD':
        return ''
    if model_type == 'client_reg':
        return _PHD_REG_URL
    return _PHD_LOG_URL  # every PHD service/activity flows through Service Log


def _build_summary(obj, model_type: str) -> str:
    """Build a human-readable one-line summary for each model type."""
    try:
        if model_type == 'clinic_visit':
            parts = [f"Visit {obj.visit_date}"]
            if obj.hiv_screening_done:
                parts.append('HIV screen')
            if obj.sti_screening_done:
                parts.append('STI screen')
            if obj.condoms_distributed:
                parts.append(f'Condoms: {obj.condoms_distributed}')
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
            # Defensive — `referred_to` and `outcome` are routinely blank on
            # PHD referrals (the field worker fills only "Referred for") and
            # used to render as the broken "Referral 2026-06-04 → · other ·
            # pending" string. Drop the missing pieces instead of the dot.
            parts = [f"Referral {obj.referral_date}"]
            if (obj.referred_to or '').strip():
                parts.append(f"→ {obj.referred_to[:40]}")
            if (obj.referral_reason or '').strip():
                parts.append(obj.referral_reason[:40])
            if (obj.referral_type or '').strip() and obj.referral_type != 'other':
                parts.append(obj.referral_type)
            return ' · '.join(parts)
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


def _pending_for_model(queryset, model_type: str, org_filter_org=None,
                       statuses=('PENDING',)):
    """Return approval dicts for a queryset at the given approval stage(s).

    statuses lets the queue show stage-1 (PENDING) and/or stage-2
    (MANAGER_APPROVED) items depending on who is looking — see
    PendingApprovalsView.get for the per-role lanes."""
    qs = queryset.filter(approval_status__in=list(statuses)).select_related('center', 'approved_by')
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
            # Two-stage flag + which gate this item is waiting on, so the UI
            # can split the Manager queue from the UNFPA queue.
            'two_stage': obj.organisation == 'Bandhu',
            'stage': ('unfpa' if obj.approval_status == 'MANAGER_APPROVED'
                      else 'manager'),
            'manager_approved_at': (obj.manager_approved_at.isoformat()
                                    if getattr(obj, 'manager_approved_at', None) else None),
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
    ('nil_report',           lambda: NilReport.objects),
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
    'nil_report': 'nil-reports',
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
        org = user.organisation
        is_unfpa = (org == 'UNFPA')
        is_super = bool(getattr(user, 'can_see_all_orgs', False)) and not is_unfpa

        # Per-role review lanes (two-stage Bandhu flow):
        #   UNFPA  → stage-2 queue: Bandhu items at MANAGER_APPROVED only.
        #   super  → everything actionable: all PENDING + Bandhu MANAGER_APPROVED.
        #   Bandhu manager → stage-1: own-org PENDING.
        #   PHD/CIPRB manager/org_lead → own-org PENDING (single stage).
        def lane(qs, model_type):
            if is_unfpa:
                return _pending_for_model(qs, model_type, 'Bandhu', statuses=('MANAGER_APPROVED',))
            if is_super:
                return _pending_for_model(qs, model_type, None,
                                          statuses=('PENDING', 'MANAGER_APPROVED'))
            return _pending_for_model(qs, model_type, org, statuses=('PENDING',))

        all_pending = []
        for model_type, qs_fn in _APPROVAL_MODELS:
            items = lane(qs_fn(), model_type)
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
            err = _apply_decision(obj, user, action_type, reason)
            if err is not None:
                return err
            obj.save()

        # Telegram — notify org chat of approval/rejection
        try:
            from .webhook import _FORM_LABELS
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


class NilReportView(views.APIView):
    """
    GET  /api/programs/nil-reports/   — list nil-reports the user can see
                                        (own org; super sees all).
    POST /api/programs/nil-reports/   — a Bandhu manager logs a "no reporting
                                        today" entry { center_id, report_date,
                                        reason }. It is created already at the
                                        manager gate (MANAGER_APPROVED) and then
                                        flows to the UNFPA approval queue.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        qs = NilReport.objects.select_related('center', 'approved_by', 'manager_approved_by')
        if not getattr(user, 'can_see_all_orgs', False):
            qs = qs.filter(organisation=user.organisation)
        out = []
        for n in qs.order_by('-report_date', '-created_at')[:300]:
            out.append({
                'id': str(n.id),
                'organisation': n.organisation,
                'center_name': n.center.name if n.center_id else 'All centres',
                'center_code': n.center.code if n.center_id else '',
                'report_date': n.report_date.isoformat(),
                'reason': n.reason,
                'approval_status': n.approval_status,
                'created_at': n.created_at.isoformat(),
            })
        return Response({'count': len(out), 'items': out})

    def post(self, request):
        user = request.user
        if not user.can_approve_submissions:
            return Response({'detail': 'Only managers can log nil-reports.'},
                            status=status.HTTP_403_FORBIDDEN)
        org = user.organisation if not getattr(user, 'can_see_all_orgs', False) else \
            (request.data.get('organisation') or 'Bandhu')
        center_id = request.data.get('center_id')
        report_date = request.data.get('report_date')
        reason = (request.data.get('reason') or '').strip()
        if not report_date or not reason:
            return Response({'detail': 'report_date and reason are required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        center = None
        if center_id:
            center = ServiceCenter.objects.filter(code=center_id).first() \
                or ServiceCenter.objects.filter(id=center_id).first()
        defaults = {
            'reason': reason,
            # Manager authored it → manager gate done; awaiting UNFPA.
            'approval_status': 'MANAGER_APPROVED',
            'manager_approved_by': user,
            'manager_approved_at': timezone.now(),
            'submitted_by': user,
        }
        obj, created = NilReport.objects.update_or_create(
            organisation=org, center=center, report_date=report_date,
            defaults=defaults,
        )
        return Response(
            {'id': str(obj.id), 'created': created, 'status': obj.approval_status},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
