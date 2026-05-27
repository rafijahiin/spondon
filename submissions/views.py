import datetime
import json
import logging

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsSupervisorOrManager, OrgFilterMixin
from .models import FormType, KoboSubmission, SubmissionStatus
from .serializers import KoboSubmissionDetailSerializer, KoboSubmissionSerializer, RejectSerializer
from .telegram import send_approval_confirmation, send_rejection_notification, send_submission_alert
from .validators import validate_kobo_signature

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Webhook helpers
# ---------------------------------------------------------------------------

def _form_type_from_payload(payload: dict) -> str | None:
    xform_id = payload.get('_xform_id_string', '')
    # Primary: map by id_string set in XLS form settings sheet
    id_string_map = {
        'spondon_mpdsr_combined_v1': FormType.MPDSR,
        'spondon_baseline_v1': FormType.BASELINE,
        'spondon_fistula_v1': FormType.FISTULA,
    }
    if xform_id in id_string_map:
        return id_string_map[xform_id]
    # Fallback: some KoboToolbox deployments send asset UID in this field
    asset_uid_map = {
        getattr(settings, 'KOBO_ASSET_UID_MPDSR', ''): FormType.MPDSR,
        getattr(settings, 'KOBO_ASSET_UID_FISTULA', ''): FormType.FISTULA,
        getattr(settings, 'KOBO_ASSET_UID_ACTIVITY', ''): FormType.ACTIVITY,
        getattr(settings, 'KOBO_ASSET_UID_BASELINE', ''): FormType.BASELINE,
    }
    return asset_uid_map.get(xform_id)


def _partner_from_payload(payload: dict) -> str:
    raw = (
        payload.get('partner_org') or payload.get('partner') or payload.get('organisation') or ''
    ).strip().upper()
    if 'PHD' in raw:
        return 'PHD'
    if 'BANDHU' in raw or 'BONDHU' in raw or 'BONDU' in raw:
        return 'Bandhu'
    return ''


def _district_from_payload(payload: dict, form_type: str) -> str:
    if form_type == FormType.MPDSR:
        sub = payload.get('form_type', '')
        field = f'{sub}_district' if sub else ''
        return payload.get(field) or payload.get('district') or ''
    return payload.get('district') or ''


def _geolocation(payload: dict) -> tuple[float | None, float | None]:
    geo = payload.get('_geolocation') or []
    try:
        return float(geo[0]), float(geo[1])
    except (TypeError, ValueError, IndexError):
        return None, None


def _parse_submitted_at(raw: str) -> datetime.datetime:
    if not raw:
        return timezone.now()
    try:
        dt = datetime.datetime.fromisoformat(raw)
        if timezone.is_naive(dt):
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt
    except (ValueError, TypeError):
        return timezone.now()


# ---------------------------------------------------------------------------
# Webhook endpoint
# ---------------------------------------------------------------------------

def _notify_gps_rejection(payload: dict, form_type: str) -> None:
    """Notify managers that a submission was rejected due to missing GPS."""
    try:
        worker_name = (
            payload.get('collector_name') or
            payload.get('worker_name') or
            payload.get('enumerator_name') or 'Field worker'
        )
        from .telegram import send_gps_rejection_notice
        send_gps_rejection_notice(worker_name, form_type)
    except Exception as exc:
        logger.debug('GPS rejection Telegram failed: %s', exc)


@csrf_exempt
@require_POST
def kobo_webhook(request):
    """
    POST /webhook/kobo/
    Receives KoboToolbox REST service payloads.
    """
    if not validate_kobo_signature(request):
        logger.warning('Webhook rejected — bad signature from %s', request.META.get('REMOTE_ADDR'))
        return HttpResponse('Forbidden', status=403)

    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponse('Bad Request — expected JSON body', status=400)

    kobo_id = str(payload.get('_id', '')).strip()
    if not kobo_id:
        return HttpResponse('Bad Request — missing _id', status=400)

    if KoboSubmission.objects.filter(kobo_id=kobo_id).exists():
        return HttpResponse('OK', status=200)  # idempotent

    form_type = _form_type_from_payload(payload)
    if not form_type:
        logger.warning('Unknown form UID: %s', payload.get('_xform_id_string'))
        return HttpResponse('Bad Request — unrecognised form UID', status=400)

    lat, lng = _geolocation(payload)

    # GPS location is mandatory on every field submission — reject without it.
    if lat is None or lng is None:
        logger.warning(
            'Webhook rejected — GPS missing. form=%s kobo_id=%s',
            form_type, kobo_id,
        )
        _notify_gps_rejection(payload, form_type)
        return HttpResponse(
            'Bad Request — location data is required. '
            'Please enable GPS/location on your phone and resubmit.',
            status=400,
        )

    # Audit FIX 2.7 — only BASELINE auto-approves (ciprb_baseline self-approves
    # per spec). MPDSR + Fistula now go through the same PENDING → manager
    # approval workflow as every other field record. Auto-approval here was
    # overbroad and bypassed the supervisor approval queue for surveillance
    # data that needs review before reaching the tracker.
    _AUTO_APPROVE = {FormType.BASELINE}
    initial_status = SubmissionStatus.APPROVED if form_type in _AUTO_APPROVE else SubmissionStatus.PENDING

    submission = KoboSubmission.objects.create(
        kobo_id=kobo_id,
        form_type=form_type,
        status=initial_status,
        partner=_partner_from_payload(payload),
        worker_name=(
            payload.get('collector_name') or
            payload.get('worker_name') or
            payload.get('enumerator_name') or ''
        ),
        district=_district_from_payload(payload, form_type),
        region=payload.get('division') or payload.get('region') or '',
        latitude=lat,
        longitude=lng,
        submitted_at=_parse_submitted_at(payload.get('_submission_time', '')),
        raw_data=payload,
    )

    try:
        send_submission_alert(submission)
    except Exception as exc:
        logger.error('Telegram dispatch error: %s', exc)

    logger.info(
        'Submission ingested: %s [%s / %s] status=%s',
        submission.id, form_type, submission.partner, initial_status,
    )
    return HttpResponse('Created', status=201)


# ---------------------------------------------------------------------------
# Manager approval API
# ---------------------------------------------------------------------------

class KoboSubmissionViewSet(OrgFilterMixin, ModelViewSet):
    queryset = KoboSubmission.objects.select_related('reviewed_by').all()
    permission_classes = [IsSupervisorOrManager]
    http_method_names = ['get', 'head', 'options', 'post']
    org_field = 'partner'

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        form_type = self.request.query_params.get('form_type')
        if status_param:
            qs = qs.filter(status=status_param)
        if form_type:
            qs = qs.filter(form_type=form_type)
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return KoboSubmissionDetailSerializer
        if self.action == 'reject':
            return RejectSerializer
        return KoboSubmissionSerializer

    def create(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Submissions arrive via KoboToolbox webhook only.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        submission = self.get_object()
        if submission.status != SubmissionStatus.PENDING:
            return Response(
                {'detail': f'Cannot approve — current status is "{submission.status}".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        submission.status = SubmissionStatus.APPROVED
        submission.reviewed_by = request.user
        submission.reviewed_at = timezone.now()
        submission.save()
        try:
            send_approval_confirmation(submission)
        except Exception as exc:
            logger.error('Telegram approval notification error: %s', exc)
        return Response(KoboSubmissionSerializer(submission).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        submission = self.get_object()
        if submission.status != SubmissionStatus.PENDING:
            return Response(
                {'detail': f'Cannot reject — current status is "{submission.status}".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = RejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission.status = SubmissionStatus.REJECTED
        submission.reviewed_by = request.user
        submission.reviewed_at = timezone.now()
        submission.rejection_reason = serializer.validated_data['rejection_reason']
        submission.save()
        try:
            send_rejection_notification(submission)
        except Exception as exc:
            logger.error('Telegram rejection notification error: %s', exc)
        return Response(KoboSubmissionSerializer(submission).data)
