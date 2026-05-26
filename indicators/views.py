"""
Indicators API views.

GET    /api/indicators/targets/          → list all IndicatorTarget records
                                            (filtered to user's partner if
                                            not can_see_all_orgs)
PATCH  /api/indicators/targets/<id>/     → edit target_value or other fields
                                            (CanConfigureTargets — Org Lead
                                            is restricted to own partner)
GET    /api/indicators/progress/         → live actual-vs-target per indicator
GET    /api/indicators/progress/<code>/  → single indicator progress

Query params for progress endpoints:
  org          — override org (developer / supervisor / org_lead only)
  period_start — YYYY-MM-DD
  period_end   — YYYY-MM-DD
"""
import logging
from datetime import date, datetime

from rest_framework import status, viewsets, views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import CanConfigureTargets
from .models import IndicatorTarget, KoboFormMapping
from .serializers import (
    IndicatorProgressSerializer,
    IndicatorTargetSerializer,
    KoboFormMappingSerializer,
)
from .service import get_all_indicators_for_org, get_indicator_progress

logger = logging.getLogger(__name__)

DEFAULT_PERIOD_START = date(2026, 5, 21)
DEFAULT_PERIOD_END   = date(2026, 11, 20)


def _resolve_params(request):
    """Extract org + period from query params, applying permission constraints."""
    user = request.user

    requested_org = request.query_params.get('org')
    if user.can_see_all_orgs and requested_org:
        org = requested_org
    elif user.can_see_all_orgs:
        org = None  # caller must handle None → "all orgs"
    elif user.can_read_other_orgs and requested_org:
        # Org Lead can request any org for read; their writes are gated
        # elsewhere via can_configure_targets.
        org = requested_org
    else:
        org = user.organisation

    def _parse_date(param, default):
        raw = request.query_params.get(param)
        if raw:
            try:
                return datetime.strptime(raw, '%Y-%m-%d').date()
            except ValueError:
                pass
        return default

    period_start = _parse_date('period_start', DEFAULT_PERIOD_START)
    period_end   = _parse_date('period_end',   DEFAULT_PERIOD_END)
    return org, period_start, period_end


class IndicatorTargetViewSet(viewsets.ModelViewSet):
    """
    Read + write for IndicatorTarget rows. Used by the Target Config screen
    at /admin/targets.

    Permission model:
      List + retrieve — any authenticated user; queryset is partner-filtered
        for users without `can_read_other_orgs`.
      Create + update + patch + delete — gated by `CanConfigureTargets`,
        which permits Developer + Supervisor for any partner and Org Lead
        only for their own partner.
    """
    queryset = IndicatorTarget.objects.select_related('partner', 'source_form', 'updated_by').all()
    serializer_class = IndicatorTargetSerializer
    permission_classes = [CanConfigureTargets]
    http_method_names = ['get', 'head', 'options', 'post', 'patch', 'delete']

    def get_queryset(self):
        qs = (
            IndicatorTarget.objects
            .select_related('partner', 'source_form', 'updated_by')
            .filter(is_active=True)
        )
        user = self.request.user
        # Read filter: managers, field staff, focals see only own partner.
        # Org Lead and Supervisor and Developer see all.
        if not user.can_read_other_orgs:
            qs = qs.filter(partner__code=user.organisation)
        return qs.order_by('partner__code', 'objective_number', 'activity_code')

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class KoboFormMappingViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only registry of Kobo forms. Filled at the validation workshop
    via Django admin or a follow-up management command."""
    queryset = KoboFormMapping.objects.filter(is_active=True).select_related('partner').order_by('form_slug')
    serializer_class = KoboFormMappingSerializer
    permission_classes = [IsAuthenticated]


class IndicatorProgressView(views.APIView):
    """
    GET /api/indicators/progress/
    Returns all indicators for the resolved org(s) with actual vs target.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org, period_start, period_end = _resolve_params(request)

        if org is None:
            results = []
            for o in ('Bandhu', 'PHD'):
                rows = get_all_indicators_for_org(o, period_start, period_end)
                for r in rows:
                    r['organisation'] = o
                results.extend(rows)
        else:
            results = get_all_indicators_for_org(org, period_start, period_end)
            for r in results:
                r['organisation'] = org

        serializer = IndicatorProgressSerializer(results, many=True)
        return Response(serializer.data)


class SingleIndicatorProgressView(views.APIView):
    """
    GET /api/indicators/progress/<code>/
    Returns progress for a single indicator.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        org, period_start, period_end = _resolve_params(request)
        if org is None:
            return Response(
                {'detail': 'Specify ?org=Bandhu or ?org=PHD for single indicator lookup.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = get_indicator_progress(org, code, period_start, period_end)
        result['organisation'] = org
        return Response(result)
