from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsSupervisorOrManager, OrgFilterMixin
from .models import FistulaCampaign
from .serializers import FistulaCampaignSerializer


class FistulaCampaignViewSet(OrgFilterMixin, ModelViewSet):
    queryset = FistulaCampaign.objects.select_related('submission', 'created_by').all()
    permission_classes = [IsSupervisorOrManager]
    http_method_names = ['get', 'head', 'options']
    org_field = 'partner'

    def get_queryset(self):
        qs = super().get_queryset()
        partner_param = self.request.query_params.get('partner')
        district_param = self.request.query_params.get('district')
        if partner_param and getattr(self.request.user, 'can_see_all_orgs', False):
            qs = qs.filter(partner=partner_param)
        if district_param:
            qs = qs.filter(district__icontains=district_param)
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
