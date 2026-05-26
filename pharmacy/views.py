from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import PrescriptionRecord
from .serializers import PrescriptionRecordSerializer


class PrescriptionRecordViewSet(viewsets.ModelViewSet):
    """
    /api/pharmacy/prescriptions/

    Any authenticated user can read; writes default `prescribed_by` to
    request.user. Org-isolation is enforced at the queryset level — users
    without cross-org visibility see only their partner's prescriptions.
    """
    serializer_class = PrescriptionRecordSerializer
    permission_classes = [IsAuthenticated]
    queryset = (
        PrescriptionRecord.objects
        .select_related('partner', 'center', 'prescribed_by')
        .all()
    )

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not getattr(user, 'can_read_other_orgs', False):
            qs = qs.filter(partner__code=user.organisation)
        drug    = self.request.query_params.get('drug')
        date    = self.request.query_params.get('date')
        partner = self.request.query_params.get('partner')
        if drug:
            qs = qs.filter(drug=drug)
        if date:
            qs = qs.filter(date=date)
        if partner and getattr(user, 'can_read_other_orgs', False):
            qs = qs.filter(partner__code=partner)
        return qs.order_by('-date', '-created_at')

    def perform_create(self, serializer):
        serializer.save(prescribed_by=self.request.user)
