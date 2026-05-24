import datetime
import logging

from django.db.models import Count, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsSuperAdmin, IsSuperAdminOrManager
from submissions.models import FormType, KoboSubmission, SubmissionStatus
from .utils import allowed_partners, current_month_bounds, previous_month_bounds

APPROVED = SubmissionStatus.APPROVED
PENDING = SubmissionStatus.PENDING

logger = logging.getLogger(__name__)


def _base_qs(user):
    """All received submissions visible to this user — pending and approved.
    Submissions are visible as soon as they arrive via webhook; the Approvals
    page is for review/QA, not a gate for dashboard visibility."""
    return KoboSubmission.objects.filter(
        partner__in=allowed_partners(user),
        status__in=[APPROVED, PENDING],
    )


def _pending_qs(user):
    return KoboSubmission.objects.filter(
        partner__in=allowed_partners(user),
        status=PENDING,
    )


# ---------------------------------------------------------------------------
# KPI cards
# ---------------------------------------------------------------------------

class KPIView(APIView):
    """
    GET /api/dashboard/kpis/
    Returns programme-wide KPI card data for the current month.
    Refreshed by the frontend every 30 seconds.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        now = timezone.now()
        month_start, month_end = current_month_bounds()
        prev_start, prev_end = previous_month_bounds()
        thirty_days_ago = now - datetime.timedelta(days=30)

        approved = _base_qs(request.user)
        pending = _pending_qs(request.user)

        this_month_qs = approved.filter(submitted_at__gte=month_start, submitted_at__lt=month_end)
        prev_month_qs = approved.filter(submitted_at__gte=prev_start, submitted_at__lt=prev_end)

        this_month_count = this_month_qs.count()
        prev_month_count = prev_month_qs.count()
        pending_count = pending.count()
        active_workers = (
            approved
            .filter(submitted_at__gte=thirty_days_ago)
            .exclude(worker_name='')
            .values('worker_name')
            .distinct()
            .count()
        )
        fistula_count = this_month_qs.filter(form_type=FormType.FISTULA).count()
        mpdsr_count = this_month_qs.filter(form_type=FormType.MPDSR).count()

        if prev_month_count > 0:
            mom_change = round((this_month_count - prev_month_count) / prev_month_count * 100, 1)
        elif this_month_count > 0:
            mom_change = 100.0
        else:
            mom_change = 0.0

        return Response({
            'submissions_this_month': this_month_count,
            'submissions_pending': pending_count,
            'active_workers': active_workers,
            'fistula_cases_this_month': fistula_count,
            'mpdsr_cases_this_month': mpdsr_count,
            'previous_month_submissions': prev_month_count,
            'mom_change_percent': mom_change,
            'target_attainment': None,  # wired up when tracker app is complete
            'as_of': now.isoformat(),
        })


# ---------------------------------------------------------------------------
# Monthly breakdown (for line/bar charts)
# ---------------------------------------------------------------------------

MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]


class MonthlyBreakdownView(APIView):
    """
    GET /api/dashboard/monthly/?year=2024
    Returns month-by-month approved submission counts split by form type.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        try:
            year = int(request.query_params.get('year', timezone.now().year))
        except (ValueError, TypeError):
            year = timezone.now().year

        partner = request.query_params.get('partner', '')
        qs = _base_qs(request.user).filter(submitted_at__year=year)
        if partner and partner in allowed_partners(request.user):
            qs = qs.filter(partner=partner)

        rows = (
            qs
            .annotate(month=TruncMonth('submitted_at'))
            .values('month', 'form_type')
            .annotate(count=Count('id'))
            .order_by('month', 'form_type')
        )

        # Build month-indexed dict: {1: {'mpdsr': 0, 'fistula': 0, ...}, ...}
        months: dict[int, dict] = {}
        for m in range(1, 13):
            months[m] = {ft: 0 for ft in FormType.values}

        for row in rows:
            m = row['month'].month
            months[m][row['form_type']] = row['count']

        results = [
            {
                'month': m,
                'month_name': MONTH_NAMES[m],
                **counts,
            }
            for m, counts in months.items()
        ]

        return Response({'year': year, 'months': results})


# ---------------------------------------------------------------------------
# Live activity feed
# ---------------------------------------------------------------------------

class ActivityFeedView(APIView):
    """
    GET /api/dashboard/activity/?limit=20
    Most recent approved submissions for the live feed.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        try:
            limit = min(int(request.query_params.get('limit', 20)), 50)
        except (ValueError, TypeError):
            limit = 20

        now = timezone.now()
        items = (
            KoboSubmission.objects
            .filter(partner__in=allowed_partners(request.user), status=APPROVED)
            .order_by('-submitted_at')
            .values('id', 'form_type', 'partner', 'worker_name', 'district', 'submitted_at')
            [:limit]
        )

        results = []
        for item in items:
            delta = now - item['submitted_at']
            minutes = int(delta.total_seconds() / 60)
            if minutes < 60:
                time_ago = f'{minutes} minute{"s" if minutes != 1 else ""} ago'
            elif minutes < 1440:
                hours = minutes // 60
                time_ago = f'{hours} hour{"s" if hours != 1 else ""} ago'
            else:
                days = minutes // 1440
                time_ago = f'{days} day{"s" if days != 1 else ""} ago'

            results.append({
                'id': str(item['id']),
                'form_type': item['form_type'],
                'form_type_display': FormType(item['form_type']).label,
                'partner': item['partner'],
                'worker_name': item['worker_name'],
                'district': item['district'],
                'submitted_at': item['submitted_at'].isoformat(),
                'time_ago': time_ago,
            })

        return Response({'results': results, 'count': len(results)})


# ---------------------------------------------------------------------------
# District ranking
# ---------------------------------------------------------------------------

class CentresView(APIView):
    """
    GET /api/dashboard/centres/
    Approved submissions this month grouped by district, ranked by count.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        month_start, month_end = current_month_bounds()
        now = timezone.now()

        partner = request.query_params.get('partner', '')
        qs = (
            _base_qs(request.user)
            .filter(submitted_at__gte=month_start, submitted_at__lt=month_end)
            .exclude(district='')
        )
        if partner and partner in allowed_partners(request.user):
            qs = qs.filter(partner=partner)

        rows = (
            qs
            .values('district')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        districts = [
            {'district': row['district'], 'count': row['count'], 'rank': rank}
            for rank, row in enumerate(rows, start=1)
        ]

        return Response({
            'month': now.strftime('%B %Y'),
            'districts': districts,
        })


# ---------------------------------------------------------------------------
# Partner aggregate (super admins only)
# ---------------------------------------------------------------------------

class PartnerSummaryView(APIView):
    """
    GET /api/dashboard/partner-summary/
    Side-by-side PHD vs Bondhu KPIs — super admin / developer only.
    """
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        month_start, month_end = current_month_bounds()
        now = timezone.now()
        thirty_days_ago = now - datetime.timedelta(days=30)

        summary = {}
        for partner in ('PHD', 'Bondhu'):
            approved = KoboSubmission.objects.filter(partner=partner, status__in=[APPROVED, PENDING])
            this_month = approved.filter(
                submitted_at__gte=month_start, submitted_at__lt=month_end
            )
            summary[partner] = {
                'submissions_this_month': this_month.count(),
                'pending': KoboSubmission.objects.filter(
                    partner=partner, status=PENDING
                ).count(),
                'active_workers': (
                    approved
                    .filter(submitted_at__gte=thirty_days_ago)
                    .exclude(worker_name='')
                    .values('worker_name').distinct().count()
                ),
                'fistula_cases': this_month.filter(form_type=FormType.FISTULA).count(),
                'mpdsr_cases': this_month.filter(form_type=FormType.MPDSR).count(),
            }

        return Response(summary)


# ---------------------------------------------------------------------------
# Map data (choropleth source)
# ---------------------------------------------------------------------------

class MapDataView(APIView):
    """
    GET /api/dashboard/map-data/
    Lat/lng of recent approved submissions for the animated map.
    Only returns submissions with valid coordinates.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        points = (
            KoboSubmission.objects
            .filter(
                partner__in=allowed_partners(request.user),
                status__in=[APPROVED, PENDING],
                latitude__isnull=False,
                longitude__isnull=False,
            )
            .order_by('-submitted_at')
            .values('id', 'latitude', 'longitude', 'form_type', 'partner', 'district', 'submitted_at')
            [:200]
        )

        return Response({
            'results': [
                {
                    'id': str(p['id']),
                    'lat': float(p['latitude']),
                    'lng': float(p['longitude']),
                    'form_type': p['form_type'],
                    'partner': p['partner'],
                    'district': p['district'],
                    'submitted_at': p['submitted_at'].isoformat(),
                }
                for p in points
            ]
        })


# ---------------------------------------------------------------------------
# Per-partner KPIs (used by OrgDashboard component)
# ---------------------------------------------------------------------------

class PartnerKPIsView(APIView):
    """
    GET /api/dashboard/partner-kpis/?partner=PHD
    Single-partner KPI card data. Mirrors KPIView but scoped to one partner.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        partner = request.query_params.get('partner', '')
        if not partner:
            return Response({'detail': 'partner query parameter required.'}, status=400)
        if partner not in allowed_partners(request.user):
            return Response({'detail': 'Access denied.'}, status=403)

        month_start, month_end = current_month_bounds()
        thirty_days_ago = timezone.now() - datetime.timedelta(days=30)

        approved = KoboSubmission.objects.filter(partner=partner, status__in=[APPROVED, PENDING])
        this_month = approved.filter(submitted_at__gte=month_start, submitted_at__lt=month_end)

        return Response({
            'submissions_this_month': this_month.count(),
            'pending': KoboSubmission.objects.filter(partner=partner, status=PENDING).count(),
            'active_workers': (
                approved
                .filter(submitted_at__gte=thirty_days_ago)
                .exclude(worker_name='')
                .values('worker_name').distinct().count()
            ),
            'fistula_cases': this_month.filter(form_type=FormType.FISTULA).count(),
            'mpdsr_cases': this_month.filter(form_type=FormType.MPDSR).count(),
        })


# ---------------------------------------------------------------------------
# Dashboard alerts (proxy over tracker.Alert)
# ---------------------------------------------------------------------------

class DashboardAlertsView(APIView):
    """
    GET /api/dashboard/alerts/?partner=PHD&acknowledged=false
    Surfaces tracker alerts to dashboard pages without requiring a separate API call.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        from tracker.models import Alert
        from tracker.serializers import AlertSerializer

        qs = Alert.objects.filter(partner__in=allowed_partners(request.user))

        partner = request.query_params.get('partner')
        if partner:
            qs = qs.filter(partner=partner)

        acknowledged = request.query_params.get('acknowledged')
        if acknowledged == 'false':
            qs = qs.filter(acknowledged=False)
        elif acknowledged == 'true':
            qs = qs.filter(acknowledged=True)

        serializer = AlertSerializer(qs.order_by('-created_at')[:50], many=True)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# AI weekly summary per partner
# ---------------------------------------------------------------------------

class OrgSummaryView(APIView):
    """
    GET /api/dashboard/org-summary/?partner=PHD
    AI-generated weekly narrative summary for the partner's OrgDashboard page.
    Falls back to a plain-text summary when Groq is not configured.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        partner = request.query_params.get('partner', '')
        if not partner:
            return Response({'detail': 'partner query parameter required.'}, status=400)
        if partner not in allowed_partners(request.user):
            return Response({'detail': 'Access denied.'}, status=403)

        now = timezone.now()
        month_start, month_end = current_month_bounds()

        approved = KoboSubmission.objects.filter(partner=partner, status__in=[APPROVED, PENDING])
        this_month = approved.filter(submitted_at__gte=month_start, submitted_at__lt=month_end)
        pending = KoboSubmission.objects.filter(partner=partner, status=PENDING).count()

        context = {
            'Partner': partner,
            'Period': now.strftime('%B %Y'),
            'Total submissions this month': this_month.count(),
            'MPDSR cases': this_month.filter(form_type=FormType.MPDSR).count(),
            'Fistula cases': this_month.filter(form_type=FormType.FISTULA).count(),
            'Activity reports': this_month.filter(form_type=FormType.ACTIVITY).count(),
            'Pending review': pending,
        }

        try:
            from reports.ai_narrative import generate_narrative
            summary = generate_narrative(context)
        except Exception as exc:
            logger.error('Narrative generation error: %s', exc)
            summary = ''

        if not summary:
            summary = (
                f'{partner} programme update for {now.strftime("%B %Y")}: '
                f'{context["Total submissions this month"]} submissions received this month, '
                f'including {context["MPDSR cases"]} MPDSR cases and '
                f'{context["Fistula cases"]} fistula cases. '
                f'{pending} submission{"s" if pending != 1 else ""} currently awaiting review.'
            )

        return Response({
            'partner': partner,
            'period': now.strftime('%B %Y'),
            'ai_summary': summary,
            'generated_at': now.isoformat(),
        })
