import datetime
import logging

from django.db.models import Count
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsSuperAdmin, IsSuperAdminOrManager
from submissions.models import FormType, KoboSubmission, SubmissionStatus
from .utils import allowed_partners, current_month_bounds, previous_month_bounds


def _months_ago(year: int, month: int, n: int) -> tuple[int, int]:
    """Return (year, month) that is n months before the given year/month."""
    total = (year - 1) * 12 + (month - 1) - n
    return (total // 12 + 1, total % 12 + 1)

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

def _time_ago(dt: datetime.datetime, now: datetime.datetime) -> str:
    """Human-readable time difference string."""
    minutes = max(0, int((now - dt).total_seconds() / 60))
    if minutes < 60:
        return f'{minutes} minute{"s" if minutes != 1 else ""} ago'
    if minutes < 1440:
        hours = minutes // 60
        return f'{hours} hour{"s" if hours != 1 else ""} ago'
    days = minutes // 1440
    return f'{days} day{"s" if days != 1 else ""} ago'


def _programs_feed_items(partners: list[str], per_model: int = 3) -> list[dict]:
    """
    Collect the most recent approved programs submissions across all active
    form types for the given partner orgs.

    Returns a list of normalised feed dicts (same shape as KoboSubmission feed),
    with a '_sort_dt' key for merging/sorting (stripped before returning to client).
    """
    from tracker.programs_query import PROGRAMS_REGISTRY
    try:
        from programs import models as pm
    except Exception:
        return []

    now = timezone.now()
    items: list[dict] = []

    for key, (model_name, label_en, _label_bn, _category) in PROGRAMS_REGISTRY.items():
        try:
            model = getattr(pm, model_name)
        except AttributeError:
            continue
        try:
            qs = (
                model.objects
                .filter(approval_status='APPROVED', organisation__in=partners)
                .select_related('center')
                .order_by('-created_at')
                [:per_model]
            )
            for obj in qs:
                center = getattr(obj, 'center', None)
                district = center.district if center else ''
                items.append({
                    'id':               str(obj.id),
                    'form_type':        key,
                    'form_type_display': label_en,
                    'partner':          obj.organisation,
                    'worker_name':      getattr(obj, 'submitted_by_kobo_user', ''),
                    'district':         district,
                    'submitted_at':     obj.created_at.isoformat(),
                    'time_ago':         _time_ago(obj.created_at, now),
                    '_sort_dt':         obj.created_at,
                })
        except Exception:
            continue

    return items


class ActivityFeedView(APIView):
    """
    GET /api/dashboard/activity/?limit=20
    Most recent approved submissions for the live feed.
    Merges legacy KoboSubmission records with new programs model submissions.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        try:
            limit = min(int(request.query_params.get('limit', 20)), 50)
        except (ValueError, TypeError):
            limit = 20

        now      = timezone.now()
        partners = allowed_partners(request.user)

        # ── Legacy submissions (KoboToolbox) ────────────────────────────────
        legacy_qs = (
            KoboSubmission.objects
            .filter(partner__in=partners, status=APPROVED)
            .order_by('-submitted_at')
            .values('id', 'form_type', 'partner', 'worker_name', 'district', 'submitted_at')
            [:limit]
        )
        legacy_items: list[dict] = []
        for item in legacy_qs:
            legacy_items.append({
                'id':               str(item['id']),
                'form_type':        item['form_type'],
                'form_type_display': FormType(item['form_type']).label,
                'partner':          item['partner'],
                'worker_name':      item['worker_name'],
                'district':         item['district'],
                'submitted_at':     item['submitted_at'].isoformat(),
                'time_ago':         _time_ago(item['submitted_at'], now),
                '_sort_dt':         item['submitted_at'],
            })

        # ── Programs submissions (new pipeline) ──────────────────────────────
        programs_items = _programs_feed_items(partners, per_model=3)

        # ── Merge, sort newest-first, trim to limit ──────────────────────────
        all_items = legacy_items + programs_items
        all_items.sort(key=lambda x: x['_sort_dt'], reverse=True)
        all_items = all_items[:limit]
        for item in all_items:
            item.pop('_sort_dt', None)

        return Response({'results': all_items, 'count': len(all_items)})


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
    Side-by-side PHD vs Bandhu KPIs — super admin / developer only.
    """
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        month_start, month_end = current_month_bounds()
        now = timezone.now()
        thirty_days_ago = now - datetime.timedelta(days=30)

        summary = {}
        for partner in ('PHD', 'Bandhu'):
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
            summary, _meta = generate_narrative(context)
        except Exception as exc:
            logger.error('narrative_generation_error', extra={'exc': str(exc)})
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


class ProgrammeSummaryView(APIView):
    """
    GET /api/dashboard/programme-summary/

    Programme-wide AI narrative. Used by the homepage AI Insights drawer
    to give senior management a single-paragraph read on the state of all
    three partners (CIPRB + Bandhu + PHD) without them having to open
    each org page in turn. Permissions: developer, supervisor, org_lead.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        # Only cross-org roles get the programme-wide view. Single-org
        # managers stay on their org's summary.
        if not request.user.can_read_other_orgs:
            return Response({'detail': 'Cross-org access required.'}, status=403)

        now = timezone.now()
        month_start, month_end = current_month_bounds()

        # Aggregate across all three partners.
        all_sub = KoboSubmission.objects.filter(status__in=[APPROVED, PENDING])
        this_month = all_sub.filter(submitted_at__gte=month_start, submitted_at__lt=month_end)
        per_partner = {}
        for p in ('CIPRB', 'Bandhu', 'PHD'):
            p_qs = this_month.filter(partner=p)
            per_partner[p] = {
                'total':   p_qs.count(),
                'mpdsr':   p_qs.filter(form_type=FormType.MPDSR).count(),
                'fistula': p_qs.filter(form_type=FormType.FISTULA).count(),
            }

        pending = KoboSubmission.objects.filter(status=PENDING).count()

        context = {
            'Period':                now.strftime('%B %Y'),
            'Total submissions':     this_month.count(),
            'CIPRB submissions':     per_partner['CIPRB']['total'],
            'Bandhu submissions':    per_partner['Bandhu']['total'],
            'PHD submissions':       per_partner['PHD']['total'],
            'MPDSR cases (CIPRB)':   per_partner['CIPRB']['mpdsr'],
            'Fistula cases (CIPRB)': per_partner['CIPRB']['fistula'],
            'Pending review (all)':  pending,
        }

        summary = ''
        meta = {}
        try:
            from reports.ai_narrative import generate_narrative
            summary, meta = generate_narrative(context)
        except Exception as exc:
            logger.error('programme_narrative_error', extra={'exc': str(exc)})

        if not summary:
            summary = (
                f'Programme update for {now.strftime("%B %Y")}: '
                f'{context["Total submissions"]} submissions received across '
                f'all three partners — CIPRB {context["CIPRB submissions"]}, '
                f'Bandhu {context["Bandhu submissions"]}, '
                f'PHD {context["PHD submissions"]}. '
                f'{context["MPDSR cases (CIPRB)"]} MPDSR cases and '
                f'{context["Fistula cases (CIPRB)"]} fistula cases under CIPRB. '
                f'{pending} submission{"s" if pending != 1 else ""} pending review.'
            )

        return Response({
            'scope': 'programme',
            'period': now.strftime('%B %Y'),
            'ai_summary': summary,
            'narrative_source': meta.get('narrative_source', 'template'),
            'generated_at': now.isoformat(),
        })


# ---------------------------------------------------------------------------
# Programs summary — counts from programs models (16 form types)
# ---------------------------------------------------------------------------

class ProgramsSummaryView(APIView):
    """
    GET /api/dashboard/programs-summary/?partner=PHD&year=2026&month=5

    Returns per-form-type counts from programs models for one partner/month,
    plus category totals, a 6-month trend, and previous-month comparison.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        from tracker.programs_query import PROGRAMS_REGISTRY, ORG_FORM_TYPES, count_programs

        partner = request.query_params.get('partner', '')
        if not partner or partner not in allowed_partners(request.user):
            return Response({'detail': 'partner required or access denied.'}, status=400)

        now = timezone.now()
        try:
            year = int(request.query_params.get('year', now.year))
            month = int(request.query_params.get('month', now.month))
        except (ValueError, TypeError):
            year, month = now.year, now.month

        # Only query form types relevant to this partner
        org_keys = [k for k in ORG_FORM_TYPES.get(partner, list(PROGRAMS_REGISTRY.keys()))
                    if k in PROGRAMS_REGISTRY]

        # Per-form-type counts for this month
        counts: dict[str, dict] = {}
        for key in org_keys:
            _, label, label_bn, category = PROGRAMS_REGISTRY[key]
            c = count_programs(key, partner, year, month)
            counts[key] = {
                'count': c,
                'label': label,
                'label_bn': label_bn,
                'category': category,
            }

        # Category totals
        categories: dict[str, int] = {}
        for item in counts.values():
            cat = item['category']
            categories[cat] = categories.get(cat, 0) + item['count']
        total = sum(c['count'] for c in counts.values())

        # Previous-month comparison
        py, pm = _months_ago(year, month, 1)
        prev_total = sum(count_programs(key, partner, py, pm) for key in org_keys)
        mom_change = (
            round((total - prev_total) / prev_total * 100, 1)
            if prev_total > 0
            else (100.0 if total > 0 else 0.0)
        )

        # 6-month trend (oldest → newest)
        monthly_trend = []
        for i in range(5, -1, -1):
            my, mm = _months_ago(year, month, i)
            clinical = sum(
                count_programs(k, partner, my, mm)
                for k in org_keys if PROGRAMS_REGISTRY[k][3] == 'Clinical'
            )
            community = sum(
                count_programs(k, partner, my, mm)
                for k in org_keys if PROGRAMS_REGISTRY[k][3] == 'Community'
            )
            operations = sum(
                count_programs(k, partner, my, mm)
                for k in org_keys if PROGRAMS_REGISTRY[k][3] == 'Operations'
            )
            monthly_trend.append({
                'month': mm,
                'year': my,
                'month_name': MONTH_NAMES[mm][:3],
                'clinical': clinical,
                'community': community,
                'operations': operations,
                'total': clinical + community + operations,
            })

        # Top 8 forms by count descending
        top_forms = sorted(
            [{'key': k, **v} for k, v in counts.items()],
            key=lambda x: x['count'],
            reverse=True,
        )[:8]

        return Response({
            'partner': partner,
            'year': year,
            'month': month,
            'total': total,
            'prev_total': prev_total,
            'mom_change': mom_change,
            'categories': categories,
            'counts': counts,
            'monthly_trend': monthly_trend,
            'top_forms': top_forms,
        })


# ---------------------------------------------------------------------------
# AI Programme Officer chat
# ---------------------------------------------------------------------------

class ChatView(APIView):
    """
    POST /api/dashboard/chat/
    Body: { question: str, partner?: str }
    Returns: { answer: str }

    Gathers live programme data as context and answers natural-language
    questions via Groq / LLaMA 3.3 70B.
    """
    permission_classes = [IsSuperAdminOrManager]

    def post(self, request):
        question = (request.data.get('question') or '').strip()
        if not question:
            return Response(
                {'detail': 'question is required.'},
                status=400,
            )
        if len(question) > 500:
            return Response(
                {'detail': 'Question must be ≤ 500 characters.'},
                status=400,
            )

        # Restrict partner scope for org managers
        partner = (request.data.get('partner') or '').strip()
        if not request.user.can_see_all_orgs:
            partner = request.user.organisation

        from .chat import answer_question
        answer = answer_question(question, partner)
        return Response({'answer': answer})
