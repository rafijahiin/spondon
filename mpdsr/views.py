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

    return Response({
        'denominators': denominators,
        'facility_counts': facility_counts,
        'facility_totals': {k: int(v or 0) for k, v in facility_totals.items()},
        'notification_by_level': notification_by_level,
        'action_plan_summaries': action_plan_summaries,
        'totals': totals,
        'review_counts': review_counts,
    })
