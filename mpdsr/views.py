import datetime

from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsSuperAdminOrManager, OrgFilterMixin
from .models import DeathType, MPDSRCase, ReviewStatus
from .serializers import MPDSRCaseSerializer, MPDSRCaseUpdateSerializer


class MPDSRCaseViewSet(OrgFilterMixin, ModelViewSet):
    queryset = MPDSRCase.objects.select_related('submission', 'created_by').all()
    permission_classes = [IsSuperAdminOrManager]
    http_method_names = ['get', 'head', 'options', 'patch']
    org_field = 'partner'

    def get_serializer_class(self):
        if self.action == 'partial_update':
            return MPDSRCaseUpdateSerializer
        return MPDSRCaseSerializer

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
