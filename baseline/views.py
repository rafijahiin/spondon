from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsSuperAdminOrManager, OrgFilterMixin
from .duplicate_detector import flag_duplicates_for_partner
from .models import BaselineSurvey, SurveyType
from .serializers import BaselineSurveySerializer


class BaselineSurveyViewSet(OrgFilterMixin, ModelViewSet):
    queryset = BaselineSurvey.objects.select_related('submission').all()
    serializer_class = BaselineSurveySerializer
    permission_classes = [IsSuperAdminOrManager]
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
        """Re-scan the authenticated user's organisation for duplicates."""
        partner = request.user.organisation
        flagged = flag_duplicates_for_partner(partner)
        return Response({'flagged': flagged, 'partner': partner})
