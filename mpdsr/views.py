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
        if partner and self.request.user.can_see_all_orgs:
            qs = qs.filter(partner=partner)
        if cause:
            qs = qs.filter(cause_of_death=cause)
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
    from django.db.models import Sum

    denominators = list(
        MPDSRDistrictDenominator.objects.values(
            'district', 'project_deaths_md', 'project_deaths_nd', 'project_deaths_sb',
        )
    )

    facility_qs = MPDSRFacilityCount.objects.all()
    facility_counts = list(
        facility_qs.values(
            'district', 'facility_name', 'period',
            'fdn_md', 'fdn_nd', 'fdn_sb', 'fdr_md', 'fdr_nd', 'fdr_sb',
        )
    )
    facility_totals = facility_qs.aggregate(
        fdn_md=Sum('fdn_md'), fdn_nd=Sum('fdn_nd'), fdn_sb=Sum('fdn_sb'),
        fdr_md=Sum('fdr_md'), fdr_nd=Sum('fdr_nd'), fdr_sb=Sum('fdr_sb'),
    )

    action_plan_summaries = []
    for a in MPDSRActionPlanSummary.objects.all():
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
        })

    totals = {
        'mpdsr_cases': MPDSRCase.objects.count(),
        'fistula_corner_cases': FistulaCornerCase.objects.count(),
        'fistula_campaign_visits': FistulaCampaignVisit.objects.count(),
    }

    return Response({
        'denominators': denominators,
        'facility_counts': facility_counts,
        'facility_totals': {k: int(v or 0) for k, v in facility_totals.items()},
        'action_plan_summaries': action_plan_summaries,
        'totals': totals,
    })
