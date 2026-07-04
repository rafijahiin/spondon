import csv
from collections import Counter

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ViewSet

from accounts.permissions import (
    IsSupervisorOrManager, CanViewBaseline, CanApproveBaseline, OrgFilterMixin,
)
from submissions.models import KoboSubmission, FormType, SubmissionStatus
from .duplicate_detector import flag_duplicates_for_partner
from .insights import compute_insights
from .models import BaselineSurvey, BaselineResponse, SurveyType
from .schema import headline, humanize, load_schema
from .serializers import BaselineSurveySerializer, BaselineResponseSerializer


# ── Legacy generic baseline (kept; old assumed maternal-health survey) ────────
class BaselineSurveyViewSet(OrgFilterMixin, ModelViewSet):
    queryset = BaselineSurvey.objects.select_related('submission').all()
    serializer_class = BaselineSurveySerializer
    permission_classes = [IsSupervisorOrManager]
    http_method_names = ['get', 'head', 'options', 'post']
    org_field = 'partner'

    def get_queryset(self):
        qs = super().get_queryset()
        survey_type = self.request.query_params.get('survey_type')
        if survey_type:
            qs = qs.filter(survey_type=survey_type)
        district = self.request.query_params.get('district')
        if district:
            qs = qs.filter(district__icontains=district)
        duplicates_only = self.request.query_params.get('duplicates_only')
        if duplicates_only == 'true':
            qs = qs.filter(is_duplicate=True)
        return qs

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'baseline': qs.filter(survey_type=SurveyType.BASELINE).count(),
            'endline': qs.filter(survey_type=SurveyType.ENDLINE).count(),
            'duplicates': qs.filter(is_duplicate=True).count(),
        })

    @action(detail=False, methods=['post'])
    def scan_duplicates(self, request):
        partner = request.user.organisation
        flagged = flag_duplicates_for_partner(partner)
        return Response({'flagged': flagged, 'partner': partner})


# ── D5 key-population baseline (Hijra / FSW) — CIPRB-conducted ────────────────

def _population(raw):
    pop = (raw.get('population') or '').lower()
    if pop in ('hijra', 'fsw'):
        return pop
    xf = (raw.get('_xform_id_string') or '').lower()
    if 'hijra' in xf:
        return 'hijra'
    if 'fsw' in xf:
        return 'fsw'
    return ''


def _pending_baseline():
    """PENDING key-population baseline submissions awaiting CIPRB verification."""
    return KoboSubmission.objects.filter(
        form_type=FormType.BASELINE, status=SubmissionStatus.PENDING,
    )


class BaselineResponseViewSet(OrgFilterMixin, ModelViewSet):
    """Verified D5 baseline responses (read-only) — collection monitoring."""
    queryset = BaselineResponse.objects.select_related('submission').all()
    serializer_class = BaselineResponseSerializer
    permission_classes = [CanViewBaseline]
    http_method_names = ['get', 'head', 'options']
    org_field = 'partner'

    def get_queryset(self):
        qs = super().get_queryset()
        pop = self.request.query_params.get('population')
        if pop:
            qs = qs.filter(population=pop)
        district = self.request.query_params.get('district')
        if district:
            qs = qs.filter(district__icontains=district)
        if self.request.query_params.get('duplicates_only') == 'true':
            qs = qs.filter(is_duplicate=True)
        return qs

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        return Response({
            'verified_total': qs.count(),
            'verified_hijra': qs.filter(population='hijra').count(),
            'verified_fsw': qs.filter(population='fsw').count(),
            'duplicates': qs.filter(is_duplicate=True).count(),
            'pending': _pending_baseline().count(),
        })

    @action(detail=False, methods=['get'])
    def insights(self, request):
        """Chart-ready aggregation over VERIFIED responses for the /baseline
        analytics section. Honours ?population= / ?district= via get_queryset."""
        return Response(compute_insights(self.get_queryset()))

    @action(detail=False, methods=['get'])
    def schema(self, request):
        """Field labels + choice maps for both instruments — lets the frontend
        render coded answers as real question/answer text. Static; cache it."""
        return Response(load_schema())

    @action(detail=False, methods=['get'])
    def export(self, request):
        qs = self.get_queryset()
        resp = HttpResponse(content_type='text/csv')
        resp['Content-Disposition'] = 'attachment; filename="baseline_responses.csv"'
        w = csv.writer(resp)
        w.writerow(['serial', 'population', 'survey_round', 'district', 'site_code',
                    'age', 'interview_outcome', 'is_duplicate', 'created_at'])
        for r in qs:
            w.writerow([r.serial, r.population, r.survey_round, r.district, r.site_code,
                        r.age or '', r.interview_outcome, r.is_duplicate,
                        r.created_at.isoformat()])
        return resp


class BaselineVerificationViewSet(ViewSet):
    """CIPRB verification gate — list PENDING baseline interviews and
    approve/reject each one. Approving flips the KoboSubmission to APPROVED,
    which materialises the verified BaselineResponse (signal). Lives inside the
    baseline area; baseline never appears in the PHD/Bandhu Manager Approvals."""

    def get_permissions(self):
        # Split read vs write: anyone in CIPRB/UNFPA (or developer) may VIEW the
        # queue; only the developer and the CIPRB manager (Tanjina) may
        # approve/reject. UNFPA + CIPRB org_lead are view-only here.
        if getattr(self, 'action', None) in ('approve', 'reject'):
            return [CanApproveBaseline()]
        return [CanViewBaseline()]

    def list(self, request):
        pending = list(_pending_baseline().order_by('-submitted_at')[:500])
        # Duplicate preview across ALL baseline submissions (serial+population),
        # so the reviewer sees a likely-duplicate before approving.
        counts = Counter()
        for raw in KoboSubmission.objects.filter(
                form_type=FormType.BASELINE).values_list('raw_data', flat=True):
            raw = raw or {}
            ser = (raw.get('questionnaire_serial') or '').strip().upper()
            if ser:
                counts[(_population(raw), ser)] += 1
        out = []
        for s in pending:
            raw = s.raw_data or {}
            pop = _population(raw)
            ser = (raw.get('questionnaire_serial') or '').strip()
            out.append({
                'submission_id': str(s.id),
                'population': pop,
                'serial': ser,
                'district': raw.get('district') or s.district or '',
                'site_code': raw.get('cluster_site_code') or raw.get('site_code') or '',
                'age': raw.get('s2_age') or raw.get('s1_age') or '',
                'interviewer': s.worker_name,
                'submitted_at': s.submitted_at,
                'gps_missing': s.latitude is None,
                'answer_count': sum(1 for v in raw.values() if v not in ('', None, [])),
                'duplicate_preview': counts.get((pop, ser.upper()), 0) > 1,
                # Curated, readable summary + full grouped Q/A for the review card.
                'headline': headline(pop, raw),
                'answers': humanize(pop, raw),
            })
        return Response(out)

    def _review(self, request, pk, new_status, note_field):
        sub = _pending_baseline().filter(pk=pk).first()
        if not sub:
            return Response({'detail': 'Not found or already reviewed.'}, status=404)
        note = request.data.get(note_field, '') if hasattr(request, 'data') else ''
        sub.status = new_status
        sub.reviewed_by = request.user
        sub.reviewed_at = timezone.now()
        if new_status == SubmissionStatus.REJECTED:
            sub.rejection_reason = note
        if hasattr(sub, 'add_review_entry'):
            sub.add_review_entry(
                user=request.user,
                action='approved' if new_status == SubmissionStatus.APPROVED else 'rejected',
                note=note,
            )
        sub.save()  # post_save signal materialises BaselineResponse on APPROVED
        return Response({'detail': new_status, 'submission_id': str(sub.id)})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._review(request, pk, SubmissionStatus.APPROVED, 'note')

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._review(request, pk, SubmissionStatus.REJECTED, 'reason')
