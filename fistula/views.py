from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import (
    CanAccessFistulaCases,
    IsSupervisorOrManager,
    OrgFilterMixin,
)
from .models import FistulaCampaign, FistulaCornerCase, FistulaCampaignVisit
from .serializers import (
    FistulaCampaignSerializer,
    FistulaCornerCaseSerializer,
    FistulaCampaignVisitSerializer,
)


class FistulaCampaignViewSet(OrgFilterMixin, ModelViewSet):
    """Legacy aggregate campaign sessions (one row per CHW day)."""
    queryset = FistulaCampaign.objects.select_related('submission', 'created_by').all()
    permission_classes = [IsSupervisorOrManager]
    http_method_names = ['get', 'head', 'options']
    org_field = 'partner'

    def get_queryset(self):
        qs = super().get_queryset()
        partner_param = self.request.query_params.get('partner')
        district_param = self.request.query_params.get('district')
        date_from = self.request.query_params.get('from')
        date_to = self.request.query_params.get('to')
        if partner_param and getattr(self.request.user, 'can_see_all_orgs', False):
            qs = qs.filter(partner=partner_param)
        if district_param:
            qs = qs.filter(district__icontains=district_param)
        # Donor-filter pill (GAC / SIDA) sends a comma-separated district
        # list. Match case-insensitively against the district field.
        districts_param = self.request.query_params.get('districts')
        if districts_param:
            names = [n.strip() for n in districts_param.split(',') if n.strip()]
            if names:
                from django.db.models import Q
                q = Q()
                for n in names:
                    q |= Q(district__iexact=n)
                qs = qs.filter(q)
        # Reporting-period filter from the CIPRB Dashboard toggle.
        if date_from:
            qs = qs.filter(campaign_date__gte=date_from)
        if date_to:
            qs = qs.filter(campaign_date__lte=date_to)
        return qs

    def get_serializer_class(self):
        return FistulaCampaignSerializer

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        today = timezone.now().date()
        month_start = today.replace(day=1)
        month_qs = qs.filter(campaign_date__gte=month_start)

        totals = month_qs.aggregate(
            women_screened=Sum('women_screened'),
            confirmed=Sum('confirmed_fistula_cases'),
            referred=Sum('cases_referred'),
            surgery=Sum('cases_surgery_completed'),
        )

        return Response({
            'total_sessions': qs.count(),
            'this_month_sessions': month_qs.count(),
            'this_month_women_screened': totals['women_screened'] or 0,
            'this_month_confirmed_cases': totals['confirmed'] or 0,
            'this_month_cases_referred': totals['referred'] or 0,
            'this_month_surgery_completed': totals['surgery'] or 0,
        })


class FistulaCornerCaseViewSet(ModelViewSet):
    """CRUD for District Hospital Fistula Corner diagnostic records.

    CIPRB-owned clinical data carrying decrypted patient PII (name, husband
    name, mobile). Access is restricted to CIPRB roles by
    CanAccessFistulaCases — developer/supervisor (all) and org_lead (CIPRB
    only). PHD/Bandhu managers and field staff are denied (audit FIX C1).
    """
    queryset = FistulaCornerCase.objects.all()
    serializer_class = FistulaCornerCaseSerializer
    permission_classes = [CanAccessFistulaCases]
    http_method_names = ['get', 'head', 'options', 'post', 'patch', 'delete']

    def get_queryset(self):
        qs = super().get_queryset().order_by('-diagnosis_date', '-created_at')
        district = self.request.query_params.get('district')
        date_from = self.request.query_params.get('from')
        date_to = self.request.query_params.get('to')
        if district:
            qs = qs.filter(district__icontains=district)
        # Donor filter — comma-separated district list from the pill.
        districts_param = self.request.query_params.get('districts')
        if districts_param:
            names = [n.strip() for n in districts_param.split(',') if n.strip()]
            if names:
                from django.db.models import Q
                q = Q()
                for n in names:
                    q |= Q(district__iexact=n)
                qs = qs.filter(q)
        # Reporting-period filter — uses diagnosis_date (event date for a
        # corner-case workflow).
        if date_from:
            qs = qs.filter(diagnosis_date__gte=date_from)
        if date_to:
            qs = qs.filter(diagnosis_date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)


class FistulaCampaignVisitViewSet(ModelViewSet):
    """CRUD for house-to-house screening visit records.

    CIPRB-owned and PII-bearing (patient name, husband name, contact).
    Restricted to CIPRB roles by CanAccessFistulaCases — audit FIX C1.
    """
    queryset = FistulaCampaignVisit.objects.all()
    serializer_class = FistulaCampaignVisitSerializer
    permission_classes = [CanAccessFistulaCases]
    http_method_names = ['get', 'head', 'options', 'post', 'patch', 'delete']

    def get_queryset(self):
        qs = super().get_queryset().order_by('-visit_date', '-created_at')
        district = self.request.query_params.get('district')
        union = self.request.query_params.get('union')
        date_from = self.request.query_params.get('from')
        date_to = self.request.query_params.get('to')
        if district:
            qs = qs.filter(district__icontains=district)
        if union:
            qs = qs.filter(union__icontains=union)
        # Donor filter — comma-separated district list from the pill.
        districts_param = self.request.query_params.get('districts')
        if districts_param:
            names = [n.strip() for n in districts_param.split(',') if n.strip()]
            if names:
                from django.db.models import Q
                q = Q()
                for n in names:
                    q |= Q(district__iexact=n)
                qs = qs.filter(q)
        # Reporting-period filter — visit_date is the event date.
        if date_from:
            qs = qs.filter(visit_date__gte=date_from)
        if date_to:
            qs = qs.filter(visit_date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)


# ─── CIPRB Fistula Question Bank aggregates — the 17 dashboard indicators ─────
from rest_framework.decorators import api_view, permission_classes as _drf_perms
from rest_framework.permissions import IsAuthenticated
from collections import Counter as _Counter
import re as _re

# Shared with the MPDSR indicators so both dashboards speak one vocabulary.
from mpdsr.code_labels import canonicalise
from .ciprb_models import CIPRBFistulaCase


def _fis_band(values, edges, labels):
    """Histogram helper: bucket integers into labelled bands."""
    out = {l: 0 for l in labels}
    for v in values:
        if v is None:
            continue
        for (lo, hi), l in zip(edges, labels):
            if lo <= v < hi:
                out[l] += 1
                break
    return out


def _fis_count(qs, field):
    return dict(_Counter(qs.exclude(**{field: ''}).values_list(field, flat=True)))


_DUR_LABELS = ['<1mo', '1-6mo', '6-12mo', '1-3yr', '3yr+', 'unparsed']


def _parse_duration_months(text):
    """Free-text duration ('2 months' / '3 years' / '6 mo') → months int, or None."""
    if not text:
        return None
    s = str(text).lower()
    m = _re.search(r'(\d+(?:\.\d+)?)', s)
    if not m:
        return None
    n = float(m.group(1))
    if 'year' in s or 'yr' in s or 'বছর' in s:
        return n * 12
    if 'week' in s or 'wk' in s or 'সপ্তাহ' in s:
        return n / 4.345
    if 'day' in s or 'দিন' in s:
        return n / 30.0
    return n  # assume months


def _dur_band(values):
    out = {l: 0 for l in _DUR_LABELS}
    for v in values:
        mo = _parse_duration_months(v)
        if mo is None:
            if v and str(v).strip():
                out['unparsed'] += 1
            continue
        if mo < 1:        out['<1mo'] += 1
        elif mo < 6:      out['1-6mo'] += 1
        elif mo < 12:     out['6-12mo'] += 1
        elif mo < 36:     out['1-3yr'] += 1
        else:             out['3yr+'] += 1
    return out


@api_view(['GET'])
@_drf_perms([IsAuthenticated])
def fistula_aggregates(request):
    """All 17 CIPRB Fistula Question Bank indicators, aggregated for the
    dashboard. Optional ?districts=A,B,C donor filter for parity with
    /api/mpdsr/aggregates/."""
    qs = CIPRBFistulaCase.objects.filter(approval_status='APPROVED')
    districts = request.GET.get('districts', '').strip()
    if districts:
        wanted = {d.strip().lower() for d in districts.split(',') if d.strip()}
        qs = qs.filter(district__in=[d for d in
                       qs.values_list('district', flat=True).distinct()
                       if d.lower() in wanted])

    # ── Monotonic pipeline from current_stage. A case at a later stage has
    #    passed through every earlier one, so the counts are cumulative and
    #    can NEVER violate suspected ≥ diagnosed ≥ referred ≥ repaired ≥
    #    rehabilitated. This is the single source of truth for the funnel and
    #    the At-a-glance KPI band (replacing the legacy dual-source split that
    #    produced the suspected=0 / diagnosed=6 contradiction).
    ORDER = ['suspected', 'diagnosed', 'referred', 'repaired', 'rehabilitated']
    stage_counts = dict(_Counter(qs.values_list('current_stage', flat=True)))
    pipeline = {}
    for i, st in enumerate(ORDER):
        pipeline[st] = sum(stage_counts.get(s, 0) for s in ORDER[i:])

    ages   = list(qs.values_list('age', flat=True))
    aam    = list(qs.values_list('age_at_marriage', flat=True))
    aafd   = list(qs.values_list('age_at_first_delivery', flat=True))
    nchild = list(qs.values_list('number_of_children', flat=True))

    # ind 10 — select_multiple stored pipe/space-separated.
    reasons = _Counter()
    for raw in qs.exclude(reasons_no_institutional_delivery='').values_list(
            'reasons_no_institutional_delivery', flat=True):
        for tok in _re.split(r'[|\s,]+', str(raw).strip()):
            if tok:
                reasons[tok] += 1

    # ── Campaign-reach tiles, sourced from the real CIPRBFistulaCase registry
    #    (NOT the demo-seeded FistulaCampaign / FistulaCornerCase). Districts /
    #    upazilas / patients reflect actual registered cases; when the registry
    #    is empty every count is 0 and the dashboard renders an empty state.
    campaign_reach = {
        'districts': qs.exclude(district='').values('district').distinct().count(),
        'upazilas': (qs.exclude(upazila='')
                       .values('district', 'upazila').distinct().count()),
        'patients': qs.count(),
    }

    return Response({
        'total': qs.count(),
        'pipeline': pipeline,
        'campaign_reach': campaign_reach,
        'age': _fis_band(ages, [(0,18),(18,25),(25,35),(35,45),(45,200)],
                         ['<18','18-24','25-34','35-44','45+']),                       # 1
        'education': _fis_count(qs, 'education'),                                       # 2
        'marital_status': _fis_count(qs, 'marital_status'),                            # 3
        'age_at_marriage': _fis_band(aam, [(0,15),(15,18),(18,21),(21,200)],
                                     ['<15','15-17','18-20','21+']),                    # 4
        'age_at_first_delivery': _fis_band(aafd, [(0,16),(16,19),(19,22),(22,200)],
                                           ['<16','16-18','19-21','22+']),              # 5
        'number_of_children': _fis_band(nchild, [(0,1),(1,2),(2,3),(3,4),(4,200)],
                                        ['0','1','2','3','4+']),                        # 6
        'mode_of_last_delivery': _fis_count(qs, 'mode_of_last_delivery'),              # 7
        'place_of_last_delivery': _fis_count(qs, 'place_of_last_delivery'),            # 8
        'conducted_last_delivery': _fis_count(qs, 'conducted_last_delivery'),          # 9
        'reasons_no_institutional_delivery': dict(reasons),                            # 10
        'time_duration_fistula_occurrence': _dur_band(
            qs.values_list('time_duration_fistula_occurrence', flat=True)),            # 11
        'duration_suffering': _dur_band(
            qs.values_list('duration_suffering', flat=True)),                          # 12
        'delivery_outcome': _fis_count(qs, 'delivery_outcome'),                        # 13
        # 14 + 16 — MERGE spelling variants, but onto the canonical CODE, not
        # an English label. 'iterogenic' was rendering as its own slice beside
        # the correctly spelled 'Iatrogenic', inventing a fistula type that
        # does not exist. Codes are kept because the Fistula Corner charts are
        # keyed on them (PIE_COLORS['obstetric'], GENITAL_TYPES 'vvf'/'rvf');
        # relabelling here emptied both of those charts.
        'fistula_type_v2': canonicalise('fistula_type',
                                        _fis_count(qs, 'fistula_type_v2')),            # 14
        'iatrogenic_cause': _fis_count(
            qs.filter(fistula_type_v2='iatrogenic'), 'iatrogenic_cause'),              # 15
        'genital_fistula_type': canonicalise(
            'genital_fistula_type', _fis_count(qs, 'genital_fistula_type')),           # 16
        'surgery_outcome_v2': _fis_count(qs, 'surgery_outcome_v2'),                    # 17
        # The outcome breakdown is captioned "of all surgically repaired
        # patients" but only counts cases that HAVE an outcome recorded (27),
        # while the funnel headline says 35 repaired. Ship the denominator so
        # the gap reads as "outcome not yet recorded" instead of as a
        # contradiction between two numbers on the same page.
        'surgery_outcome_coverage': {
            'recorded': sum(_fis_count(qs, 'surgery_outcome_v2').values()),
            'repaired_total': pipeline['repaired'],
            'pending': max(0, pipeline['repaired']
                           - sum(_fis_count(qs, 'surgery_outcome_v2').values())),
        },
    })
