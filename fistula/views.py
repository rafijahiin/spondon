import datetime

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsSuperAdminOrManager, OrgFilterMixin
from .models import CaseStatus, FistulaCase
from .serializers import FistulaCaseSerializer, FistulaCaseUpdateSerializer


class FistulaCaseViewSet(OrgFilterMixin, ModelViewSet):
    queryset = FistulaCase.objects.select_related('submission', 'created_by').all()
    permission_classes = [IsSuperAdminOrManager]
    http_method_names = ['get', 'head', 'options', 'patch']
    org_field = 'partner'

    def get_serializer_class(self):
        if self.action == 'partial_update':
            return FistulaCaseUpdateSerializer
        return FistulaCaseSerializer

    @action(detail=False, methods=['get'])
    def overdue(self, request):
        today = datetime.date.today()
        qs = self.get_queryset().filter(
            follow_up_date__lt=today,
            follow_up_date__isnull=False,
        ).exclude(status=CaseStatus.REFERRAL_COMPLETED)
        serializer = FistulaCaseSerializer(qs, many=True)
        return Response({'count': qs.count(), 'results': serializer.data})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        today = datetime.date.today()
        month_start = today.replace(day=1)

        by_status = {
            status: qs.filter(status=status).count()
            for status in CaseStatus.values
        }
        overdue_count = qs.filter(
            follow_up_date__lt=today,
            follow_up_date__isnull=False,
        ).exclude(status=CaseStatus.REFERRAL_COMPLETED).count()

        return Response({
            'total': qs.count(),
            'by_status': by_status,
            'overdue': overdue_count,
            'this_month': qs.filter(date_identified__gte=month_start).count(),
        })
