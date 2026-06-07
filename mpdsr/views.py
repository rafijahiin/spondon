import datetime

from rest_framework.decorators import action, api_view, permission_classes as drf_permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import CanAccessMPDSR, OrgFilterMixin
from .models import (
    DeathType, MPDSRCase, ReviewStatus,
    MPDSRDistrictDenominator, MPDSRFacilityCount, MPDSRActionPlanSummary,
)
from .serializers import MPDSRCaseSerializer, MPDSRCaseUpdateSerializer


class MPDSRCaseViewSet(OrgFilterMixin, ModelViewSet):
    queryset = MPDSRCase.objects.select_related('submission', 'created_by').all()
    # MPDSR is CIPRB-owned per the IDMS handoff. PHD + Bandhu managers
    # lose access here; only Dev, Supervisor, and CIPRB Org Lead see records.
    permission_classes = [CanAccessMPDSR]
    http_method_names = ['get', 'head', 'options', 'patch']
    org_field = 'partner'

    def get_queryset(self):
        qs = super().get_queryset()
        partner = self.request.query_params.get('partner')
        cause = self.request.query_params.get('cause_of_death')
        date_from = self.request.query_params.get('from')
        date_to = self.request.query_params.get('to')
        if partner and self.request.user.can_see_all_orgs:
            qs = qs.filter(partner=partner)
        if cause:
            qs = qs.filter(cause_of_death=cause)
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
        # Hide stillbirth review sub-forms (F3, F6) from the dashboard
        # — Animesh decision in the 2026-06-01 meeting. Records stay in DB
        # for audit, just don't surface in API responses.
        qs = qs.exclude(sub_form_type__in=['f3', 'f6'])
        # Reporting-period filter — CIPRB Dashboard reporting-period toggle
        # passes ?from=YYYY-MM-DD&to=YYYY-MM-DD. Filters on date_of_death,
        # which is the canonical event date for an MPDSR case.
        if date_from:
            qs = qs.filter(date_of_death__gte=date_from)
        if date_to:
            qs = qs.filter(date_of_death__lte=date_to)
        return qs

    def get_serializer_class(self):
        if self.action == 'partial_update':
            return MPDSRCaseUpdateSerializer
        return MPDSRCaseSerializer

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        old_status = instance.status

        serializer = MPDSRCaseUpdateSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data.get('status', old_status)

        serializer.save()

        if new_status != old_status:
            instance.add_audit_entry(
                user_email=request.user.email,
                action=f'Status changed: {old_status} → {new_status}',
                notes=serializer.validated_data.get('notes', ''),
            )
            instance.save(update_fields=['audit_trail'])

        return Response(MPDSRCaseSerializer(instance).data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        today = datetime.date.today()
        month_start = today.replace(day=1)

        by_status = {
            status: qs.filter(status=status).count()
            for status in ReviewStatus.values
        }
        by_death_type = {
            dt: qs.filter(death_type=dt).count()
            for dt in DeathType.values
        }
        overdue_committee = qs.filter(
            committee_date__lt=today,
            committee_date__isnull=False,
        ).exclude(status=ReviewStatus.CLOSED).count()

        return Response({
            'total': qs.count(),
            'by_status': by_status,
            'by_death_type': by_death_type,
            'overdue_committee': overdue_committee,
            'this_month': qs.filter(date_of_death__gte=month_start).count(),
        })


# ─── Aggregate endpoint feeding the CIPRB Dashboard visualizations ───────────


@api_view(['GET'])
@drf_permission_classes([IsAuthenticated, CanAccessMPDSR])
def mpdsr_aggregates(request):
    """One endpoint, one shot — returns everything the CIPRB Dashboard needs
    for the visualizations Animesh asked for:

    {
      "denominators": [ { district, project_deaths_md, ... }, ... ],
      "facility_counts": [ { district, facility_name, fdn_md, fdr_md, ... }, ... ],
      "facility_totals": { fdn_md, fdr_md, fdn_nd, fdr_nd, ... },
      "action_plan_summaries": [ { district, level, planned, executed, pct }, ... ],
      "totals": { mpdsr_cases, fistula_corner_cases, fistula_campaign_visits }
    }
    """
    from fistula.models import FistulaCornerCase, FistulaCampaignVisit
    from django.db.models import Sum, Q

    # Donor filter — comma-separated district list from the pill.
    districts_param = request.query_params.get('districts')
    district_names = None
    if districts_param:
        district_names = [n.strip() for n in districts_param.split(',') if n.strip()]

    def apply_donor(qs, field='district'):
        if not district_names:
            return qs
        q = Q()
        for n in district_names:
            q |= Q(**{f'{field}__iexact': n})
        return qs.filter(q)

    denom_qs = apply_donor(MPDSRDistrictDenominator.objects.all())
    denominators = list(
        denom_qs.values(
            'district', 'project_deaths_md', 'project_deaths_nd', 'project_deaths_sb',
        )
    )

    facility_qs = apply_donor(MPDSRFacilityCount.objects.all())
    facility_counts = list(
        facility_qs.values(
            'district', 'facility_name', 'period',
            'fdn_md', 'fdn_nd', 'fdn_sb', 'fdr_md', 'fdr_nd', 'fdr_sb',
        )
    )
    facility_totals = facility_qs.aggregate(
        cdn_md=Sum('cdn_md'), cdn_nd=Sum('cdn_nd'), cdn_sb=Sum('cdn_sb'),
        fdn_md=Sum('fdn_md'), fdn_nd=Sum('fdn_nd'), fdn_sb=Sum('fdn_sb'),
        fdr_md=Sum('fdr_md'), fdr_nd=Sum('fdr_nd'), fdr_sb=Sum('fdr_sb'),
    )

    # Notification by level (Animesh: "separated by Community / Facility").
    # CDN = community death notification, FDN = facility death notification.
    def _ft(k):
        return int(facility_totals.get(k) or 0)
    notification_by_level = {
        'md': {'community': _ft('cdn_md'), 'facility': _ft('fdn_md')},
        'nd': {'community': _ft('cdn_nd'), 'facility': _ft('fdn_nd')},
        'sb': {'community': _ft('cdn_sb'), 'facility': _ft('fdn_sb')},
    }

    action_plan_summaries = []
    for a in apply_donor(MPDSRActionPlanSummary.objects.all()):
        action_plan_summaries.append({
            'district': a.district,
            'level': a.level,
            'place_of_meeting': a.place_of_meeting,
            'meeting_date': a.meeting_date,
            'participants': a.participants,
            'meetings_planned': a.meetings_planned,
            'activities_planned': a.activities_planned,
            'activities_implemented': a.activities_implemented,
            'completion_pct': a.completion_pct,
            'actions': a.actions or [],
        })

    # Exclude F3 / F6 stillbirth reviews from dashboard surface counts
    # (Animesh decision, 2026-06-01 meeting). Records remain in DB.
    mpdsr_qs = MPDSRCase.objects.exclude(sub_form_type__in=['f3', 'f6'])
    totals = {
        'mpdsr_cases': apply_donor(mpdsr_qs).count(),
        'fistula_corner_cases': apply_donor(FistulaCornerCase.objects.all()).count(),
        'fistula_campaign_visits': apply_donor(FistulaCampaignVisit.objects.all()).count(),
    }

    # Per-sub-form review counts — Animesh's 2026-06-02 spec splits the
    # single "MD Review Rate" into three: Community MD Review (CDN via
    # va_md), Facility MD Review (FDR via f4), and Social Autopsy (sa_md).
    # Denominator for each is MD notified (f1 + f2 rows).
    from django.db.models import Count
    md_donor_qs = apply_donor(mpdsr_qs)
    review_rows = (
        md_donor_qs.values('sub_form_type')
        .annotate(c=Count('id'))
    )
    review_counts = {r['sub_form_type']: r['c'] for r in review_rows}
    notified_md = review_counts.get('f1', 0) + review_counts.get('f2', 0)
    review_counts['notified_md'] = notified_md

    # ── CIPRB dashboard "major indicators" (11) — per-case breakdowns from
    #    the donor-filtered maternal cohort (Form 01 community + Form 04
    #    facility). Categorical counts + integer histograms. Existing keys
    #    unchanged → no frontend regression.
    from collections import Counter as _Counter

    # The 11 MPDSR indicators are MATERNAL-death indicators sourced from
    # Form 01 (community, f1) + Form 04 (facility, f4) per the CIPRB spec.
    # Restrict to that cohort so every indicator counts the SAME cases:
    #  - death_type=maternal  → drop neonatal (f2/f5)
    #  - sub_form_type in f1/f4 → drop Social Autopsy (sa_md, a re-review,
    #    not a distinct death) and any historical verbal-autopsy import
    #  This is what makes Place-of-Death consistent with the other 10
    #  (previously it counted the whole cohort and showed ~495 vs ~18).
    ind_qs = md_donor_qs.filter(
        death_type=DeathType.MATERNAL,
        sub_form_type__in=['f1', 'f4'],
    )

    def _cnt(field):
        return dict(_Counter(
            ind_qs.exclude(**{field: ''}).values_list(field, flat=True)))

    def _band(field, edges, labels):
        vals = [v for v in ind_qs.values_list(field, flat=True) if v is not None]
        out = {l: 0 for l in labels}
        for v in vals:
            for (lo, hi), l in zip(edges, labels):
                if lo <= v < hi:
                    out[l] += 1
                    break
        return out

    indicators = {
        'place_of_death':           _cnt('place_of_death'),            # 1
        'time_of_death':            _cnt('time_of_death'),             # 2
        'gestational_weeks':        _band('gestational_weeks',
            [(0, 28), (28, 34), (34, 37), (37, 42), (42, 99)],
            ['<28', '28-33', '34-36', '37-41', '42+']),                # 3
        'anc_visits_count':         _cnt('anc_visits_count'),          # 4
        'pnc_received':             _cnt('pnc_received'),              # 5 (PNC)
        'mode_of_delivery':         _cnt('mode_of_delivery'),          # 6
        'delivery_outcome':         _cnt('delivery_outcome'),          # 7
        'place_of_delivery':        _cnt('place_of_delivery'),         # 8
        'person_assisted_delivery': _cnt('person_assisted_delivery'),  # 9
        'maternal_age': _band('age_years',
            [(0, 20), (20, 25), (25, 30), (30, 35), (35, 40), (40, 45), (45, 99)],
            ['<20', '20-24', '25-29', '30-34', '35-39', '40-44', '45+']),  # 10
        'time_death_after_birth_hours': _band('time_death_after_birth_hours',
            [(0, 24), (24, 48), (48, 168), (168, 99999)],
            ['0-24h', '24-48h', '2-7d', '7d+']),                       # 11
    }

    return Response({
        'denominators': denominators,
        'facility_counts': facility_counts,
        'facility_totals': {k: int(v or 0) for k, v in facility_totals.items()},
        'notification_by_level': notification_by_level,
        'action_plan_summaries': action_plan_summaries,
        'totals': totals,
        'review_counts': review_counts,
        'indicators': indicators,
    })


@api_view(['GET'])
@drf_permission_classes([IsAuthenticated, CanAccessMPDSR])
def mnm_aggregates(request):
    """Aggregate endpoint for the Maternal Near Miss panel on /ciprb.

    Returns the 6 CIPRB-requested indicators (severe maternal
    complications, critical interventions, life-threatening conditions,
    mode of delivery, causes, contributory conditions) as district-rolled
    counts. Drop-in for the React MaternalNearMissPanel component."""
    from collections import Counter
    from .ciprb_models import MaternalNearMissCase
    qs = MaternalNearMissCase.objects.all()
    total = qs.count()
    by_district = Counter(qs.values_list('district', flat=True))
    # 6 severe maternal complications (boolean fields).
    severe = {f: qs.filter(**{f: True}).count() for f in (
        'sev_pph', 'sev_preec', 'eclampsia', 'sepsis',
        'rupt_uterus', 'sev_abortion',
    )}
    critical = {f: qs.filter(**{f: True}).count() for f in (
        'crit_blood', 'crit_radiol', 'crit_laparot', 'crit_icu',
    )}
    life_threat = {f: qs.filter(**{f: True}).count() for f in (
        'life_cardio', 'life_resp', 'life_renal', 'life_coag',
        'life_hepatic', 'life_neuro', 'life_uterine',
    )}
    mode_of_delivery = Counter(
        qs.exclude(mode_of_delivery='').values_list('mode_of_delivery', flat=True)
    )
    causes = Counter(
        qs.exclude(cause_of_near_miss='').values_list('cause_of_near_miss', flat=True)
    )
    # Indicator 6 — Contributory / associated conditions. Free text; expose
    # the non-empty excerpts as a read-only list for the dashboard notes panel.
    contributory = list(
        qs.exclude(contributory_conditions='')
          .values_list('contributory_conditions', flat=True)[:200]
    )
    return Response({
        'total': total,
        'by_district': dict(by_district),
        'severe_complications': severe,
        'critical_interventions': critical,
        'life_threatening': life_threat,
        'mode_of_delivery': dict(mode_of_delivery),
        'causes': dict(causes),
        'contributory_conditions': contributory,
    })
