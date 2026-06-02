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
        # Reporting-period filter — visit_date is the event date.
        if date_from:
            qs = qs.filter(visit_date__gte=date_from)
        if date_to:
            qs = qs.filter(visit_date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)
