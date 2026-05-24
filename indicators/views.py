"""
Indicators API views.

GET  /api/indicators/targets/          → list all IndicatorTarget records (filtered by org)
GET  /api/indicators/progress/         → all indicators with actual vs target for request period
GET  /api/indicators/progress/<code>/  → single indicator progress

Query params for progress endpoints:
  org          — override org (super_admin / CIPRB / UNFPA only)
  period_start — YYYY-MM-DD
  period_end   — YYYY-MM-DD
"""
import logging
from datetime import date, datetime
from rest_framework import viewsets, views, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import IndicatorTarget
from .serializers import IndicatorTargetSerializer, IndicatorProgressSerializer
from .service import get_all_indicators_for_org, get_indicator_progress

logger = logging.getLogger(__name__)

DEFAULT_PERIOD_START = date(2026, 5, 21)
DEFAULT_PERIOD_END   = date(2026, 11, 20)


def _resolve_params(request):
    """Extract org + period from query params, applying permission constraints."""
    user = request.user

    # org
    requested_org = request.query_params.get('org')
    if user.can_see_all_orgs and requested_org:
        org = requested_org
    elif user.can_see_all_orgs:
        org = None  # caller must handle None → "all orgs"
    else:
        org = user.organisation

    # period
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


class IndicatorTargetViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only list/retrieve of IndicatorTarget records."""
    queryset = IndicatorTarget.objects.filter(is_active=True)
    serializer_class = IndicatorTargetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = IndicatorTarget.objects.filter(is_active=True)
        if not user.can_see_all_orgs:
            qs = qs.filter(organisation=user.organisation)
        return qs.order_by('organisation', 'indicator_code')


class IndicatorProgressView(views.APIView):
    """
    GET /api/indicators/progress/
    Returns all indicators for the resolved org(s) with actual vs target.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org, period_start, period_end = _resolve_params(request)

        if org is None:
            # Super admin with no org filter → return both orgs
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
