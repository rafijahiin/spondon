from django.db.models import Count
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from rest_framework.views import APIView

from accounts.permissions import IsSuperAdmin, IsSuperAdminOrManager, OrgFilterMixin
from submissions.models import FormType, KoboSubmission, SubmissionStatus
from .forecasting import attainment_percent, linear_forecast
from .models import Alert, MonthlyTarget
from .serializers import AlertSerializer, MonthlyTargetSerializer


class MonthlyTargetViewSet(ModelViewSet):
    """CRUD for monthly targets — super admins only."""
    queryset = MonthlyTarget.objects.all()
    serializer_class = MonthlyTargetSerializer
    permission_classes = [IsSuperAdmin]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class AlertViewSet(OrgFilterMixin, ModelViewSet):
    """List and acknowledge alerts."""
    queryset = Alert.objects.all()
    serializer_class = AlertSerializer
    permission_classes = [IsSuperAdminOrManager]
    http_method_names = ['get', 'head', 'options', 'patch', 'post']
    org_field = 'partner'

    def get_queryset(self):
        qs = super().get_queryset()
        acknowledged = self.request.query_params.get('acknowledged')
        if acknowledged == 'false':
            qs = qs.filter(acknowledged=False)
        elif acknowledged == 'true':
            qs = qs.filter(acknowledged=True)
        return qs

    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        alert = self.get_object()
        if not alert.acknowledged:
            alert.acknowledged = True
            alert.acknowledged_by = request.user
            alert.acknowledged_at = timezone.now()
            alert.save(update_fields=['acknowledged', 'acknowledged_by', 'acknowledged_at'])
        return Response(AlertSerializer(alert).data)


class ForecastView(APIView):
    """
    GET /api/tracker/forecast/?partner=PHD&form_type=mpdsr&periods=3
    Returns last 6 months actual counts + N-period linear-trend forecast.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        partner = request.query_params.get('partner', '')
        form_type = request.query_params.get('form_type', FormType.MPDSR)
        try:
            periods = min(int(request.query_params.get('periods', 3)), 12)
        except (ValueError, TypeError):
            periods = 3

        now = timezone.now()
        # Build 6 months of historical data
        history = []
        for offset in range(5, -1, -1):
            month_num = (now.month - 1 - offset) % 12 + 1
            year_offset = (now.month - 1 - offset) // 12
            year = now.year - year_offset
            qs = KoboSubmission.objects.filter(
                form_type=form_type,
                status=SubmissionStatus.APPROVED,
                submitted_at__year=year,
                submitted_at__month=month_num,
            )
            if partner:
                qs = qs.filter(partner=partner)
            history.append({
                'year': year,
                'month': month_num,
                'actual': qs.count(),
            })

        counts = [h['actual'] for h in history]
        forecasted = linear_forecast(counts, periods_ahead=periods)

        # Append forecast entries
        for i, value in enumerate(forecasted, start=1):
            month_num = (now.month - 1 + i) % 12 + 1
            year = now.year + (now.month - 1 + i) // 12
            history.append({
                'year': year,
                'month': month_num,
                'forecast': value,
            })

        # Current month attainment
        current_target = MonthlyTarget.objects.filter(
            partner=partner or '',
            form_type=form_type,
            year=now.year,
            month=now.month,
        ).first()
        attainment = None
        if current_target:
            actual_this_month = counts[-1]  # last in history list is current month
            attainment = attainment_percent(actual_this_month, current_target.target)

        return Response({
            'partner': partner,
            'form_type': form_type,
            'history': history,
            'attainment_percent': attainment,
        })
