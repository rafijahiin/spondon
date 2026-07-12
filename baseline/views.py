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
from submissions.flatten import flatten_group_keys
from submissions.models import KoboSubmission, FormType, SubmissionStatus
from .duplicate_detector import flag_duplicates_for_partner
from .insights import compute_insights
from .monitoring import compute_monitoring
from .derive import derive_fields
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
        # Population and dedup key come from the FORM, not the stored columns:
        # older rows misfiled every FSW interview as hijra, and `is_duplicate` was
        # computed against questionnaire_serial — a field neither live form
        # collects — so the stored flag is False on every row ever ingested.
        pops = Counter()
        serials = Counter()
        total = 0
        # NB: no .only() here — the queryset uses select_related('submission'),
        # and deferring a select_related field raises FieldError (500).
        for r in qs:
            total += 1
            d = derive_fields(r.raw_data, fallback_district=r.district)
            pops[d['population'] or r.population] += 1
            key = (d['population'] or r.population, (d['serial'] or '').upper())
            if key[1]:
                serials[key] += 1
        # Count the EXTRA copies: 3 uploads of one interview = 2 duplicates.
        # Same rule as monitoring.py, so the two panels can't disagree.
        duplicates = sum(n - 1 for n in serials.values() if n > 1)
        return Response({
            'verified_total': total,
            'verified_hijra': pops.get('hijra', 0),
            'verified_fsw': pops.get('fsw', 0),
            'duplicates': duplicates,
            'pending': _pending_baseline().count(),
        })

    @action(detail=False, methods=['get'])
    def insights(self, request):
        """Chart-ready aggregation over VERIFIED responses for the /baseline
        analytics section. Honours ?population= / ?district= via get_queryset."""
        return Response(compute_insights(self.get_queryset()))

    @action(detail=False, methods=['get'])
    def srhr(self, request):
        """Major SRHR indicators (CIPRB's Dashbroad list) over verified
        responses, grouped by questionnaire module, per population."""
        from .srhr import compute_srhr
        return Response(compute_srhr(self.get_queryset()))

    @action(detail=False, methods=['get'])
    def monitoring(self, request):
        """Fieldwork + data-quality monitoring over ALL collected baseline
        submissions (pending + approved) — the collection command center. Reads
        the submissions directly (not just verified rows) because monitoring is
        about the collection itself: pace, per-site/enumerator throughput,
        interview duration/outcome, and the quality flags."""
        from submissions.models import KoboSubmission, FormType
        subs = KoboSubmission.objects.filter(form_type=FormType.BASELINE)
        return Response(compute_monitoring(subs))

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
            # Derive from raw_data at READ time. Rows ingested before the flatten /
            # population fixes have wrong stored columns (every FSW interview filed
            # as 'hijra', blank district/age/outcome). Deriving here keeps the export
            # correct without a bulk UPDATE of production data. Stored value is used
            # only when the payload cannot answer.
            d = derive_fields(r.raw_data, fallback_district=r.district)
            w.writerow([d['serial'] or r.serial,
                        d['population'] or r.population,
                        d['survey_round'] or r.survey_round,
                        d['district'] or r.district,
                        d['site_code'] or r.site_code,
                        (d['age'] if d['age'] is not None else (r.age or '')),
                        d['interview_outcome'] or r.interview_outcome,
                        r.is_duplicate,
                        r.created_at.isoformat()])
        return resp


class BaselineVerificationViewSet(ViewSet):
    """CIPRB verification gate — list PENDING baseline interviews and
    approve/reject each one. Approving flips the KoboSubmission to APPROVED,
    which materialises the verified BaselineResponse (signal). This is the ONLY
    approval surface for baseline: KoboSubmissionViewSet.get_queryset excludes
    form_type=BASELINE, so baseline never appears in the generic Manager
    Approvals queue (any org tab) and cannot be approved via /submissions/."""

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
            d = derive_fields(raw or {})
            ser = d['serial'].upper()
            if ser:
                counts[(d['population'] or '', ser)] += 1
        out = []
        for s in pending:
            # Kobo nests grouped answers as 'group/field' — flatten before reading
            # district / age / the Q&A card, or every one of them renders blank.
            raw = flatten_group_keys(s.raw_data or {})
            d = derive_fields(raw, fallback_district=s.district)
            pop = d['population'] or ''
            ser = d['serial']
            out.append({
                'submission_id': str(s.id),
                'population': pop,
                'serial': ser,
                'district': d['district'],
                'site_code': d['site_code'],
                'age': d['age'] if d['age'] is not None else '',
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


# ── FSW anomaly console (deterministic rule engine) ──────────────────────────
from rest_framework import status as http_status  # noqa: E402

from .anomaly import build_report  # noqa: E402
from .models import AnomalyReview  # noqa: E402

_REVIEW_STATUSES = {c[0] for c in AnomalyReview.STATUS_CHOICES}


class FswAnomalyViewSet(ViewSet):
    """Read-only FSW anomaly report from the deterministic engine, merged with
    the separate review-decision table. Never edits raw Kobo data."""

    def get_permissions(self):
        if getattr(self, 'action', None) == 'review':
            return [CanViewBaseline()]
        return [CanViewBaseline()]

    def list(self, request):
        report = build_report()
        reviews = {
            (r.submission_id, r.rule_id): r
            for r in AnomalyReview.objects.select_related('reviewed_by')
        }

        needs_review = set()
        for anomaly in report['anomalies']:
            key = (anomaly.get('record_id'), anomaly['rule_id'])
            review = reviews.get(key)
            if review:
                anomaly['review_status'] = review.status
                anomaly['review_note'] = review.note
                anomaly['reviewed_by'] = (
                    review.reviewed_by.full_name if review.reviewed_by else None)
                anomaly['reviewed_at'] = (
                    review.reviewed_at.isoformat() if review.reviewed_at else None)
            else:
                anomaly['review_status'] = 'new'
                anomaly['review_note'] = ''
                anomaly['reviewed_by'] = None
                anomaly['reviewed_at'] = None
            if anomaly['review_status'] == 'new' and anomaly.get('record_id'):
                needs_review.add(anomaly['record_id'])

        # KPI extras the single-count card could never show.
        scanned = report['records_scanned'] or 0
        rule_counts = report['summary']['top_rules']
        missing_end = rule_counts.get('MISSING_INTERVIEW_END', 0)
        old_version = rule_counts.get('OLD_FORM_VERSION', 0)
        report['kpis'] = {
            'critical': report['summary']['by_severity']['critical'],
            'high': report['summary']['by_severity']['high'],
            'medium': report['summary']['by_severity']['medium'],
            'low': report['summary']['by_severity']['low'],
            'records_requiring_review': len(needs_review),
            'records_cleared': max(0, scanned - len(needs_review)),
            'timing_completeness_pct': (
                round(100 * (scanned - missing_end) / scanned) if scanned else 0),
            'current_form_adoption_pct': (
                round(100 * (scanned - old_version) / scanned) if scanned else 0),
        }
        return Response(report)

    @action(detail=False, methods=['post'])
    def review(self, request):
        """Record/replace a review decision for one (submission_id, rule_id)."""
        sid = (request.data.get('submission_id') or '').strip()
        rid = (request.data.get('rule_id') or '').strip()
        new_status = (request.data.get('status') or '').strip()
        note = request.data.get('note', '') or ''
        if not sid or not rid:
            return Response({'detail': 'submission_id and rule_id are required.'},
                            status=http_status.HTTP_400_BAD_REQUEST)
        if new_status not in _REVIEW_STATUSES:
            return Response({'detail': f'status must be one of {sorted(_REVIEW_STATUSES)}.'},
                            status=http_status.HTTP_400_BAD_REQUEST)
        obj, _created = AnomalyReview.objects.update_or_create(
            submission_id=sid, rule_id=rid,
            defaults={'status': new_status, 'note': note,
                      'reviewed_by': request.user, 'reviewed_at': timezone.now()},
        )
        return Response({
            'submission_id': obj.submission_id, 'rule_id': obj.rule_id,
            'status': obj.status, 'note': obj.note,
            'reviewed_by': obj.reviewed_by.full_name if obj.reviewed_by else None,
            'reviewed_at': obj.reviewed_at.isoformat() if obj.reviewed_at else None,
        })
