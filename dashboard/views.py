import datetime
import logging

from django.db.models import Count
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsSupervisorOrOrgLead, IsSupervisorOrManager
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
    permission_classes = [IsSupervisorOrManager]

    def get(self, request):
        now = timezone.now()
        month_start, month_end = current_month_bounds()
        prev_start, prev_end = previous_month_bounds()
        thirty_days_ago = now - datetime.timedelta(days=30)

        approved = _base_qs(request.user)
        pending = _pending_qs(request.user)

        this_month_qs = approved.filter(submitted_at__gte=month_start, submitted_at__lt=month_end)
        prev_month_qs = approved.filter(submitted_at__gte=prev_start, submitted_at__lt=prev_end)

        # Legacy KoboSubmission counts (MPDSR / Fistula / Baseline / Activity).
        this_month_count = this_month_qs.count()
        prev_month_count = prev_month_qs.count()

        # Programs-models contribution — sum across every SubmissionBase
        # subclass. The Bento KPI previously read only KoboSubmission,
        # so PHD/Bandhu Outreach / ClinicVisit / HTC / etc. that landed
        # via /webhook/programs/form/<slug>/ were invisible on the home
        # page. Add their created_at counts to the same buckets.
        try:
            from programs.models import (
                ClinicVisit, HIVSTITestResult, ADRRecord, AutoclaveLog, AntenatalCard,
                HTCCounselling, IndividualCounselling, MHScreening,
                GBVCase, OutreachSession, GroupEducationSession, Referral,
                SafetyHygieneKit, TrainingEvent, CoordMeeting, MobileHealthCamp,
                IECMaterial,
            )
            _PROGRAMS_MODELS = [
                ClinicVisit, HIVSTITestResult, ADRRecord, AutoclaveLog, AntenatalCard,
                HTCCounselling, IndividualCounselling, MHScreening,
                GBVCase, OutreachSession, GroupEducationSession, Referral,
                SafetyHygieneKit, TrainingEvent, CoordMeeting, MobileHealthCamp,
                IECMaterial,
            ]
            for Model in _PROGRAMS_MODELS:
                qs = Model.objects.filter(approval_status='APPROVED')
                # Org isolation parity with the legacy queryset.
                if not request.user.can_see_all_orgs:
                    qs = qs.filter(organisation=request.user.organisation)
                this_month_count += qs.filter(
                    created_at__gte=month_start, created_at__lt=month_end,
                ).count()
                prev_month_count += qs.filter(
                    created_at__gte=prev_start, created_at__lt=prev_end,
                ).count()
        except Exception:
            # Programs app not loaded in some test contexts — fall through
            # with legacy-only counts so the endpoint still responds.
            pass
        pending_count = pending.count()
        # Also count PENDING rows from every programs model so the spine
        # badge increments when PHD/Bandhu service-log submissions land
        # (Referral, ClinicVisit, HIVSTITestResult, etc.). Without this,
        # the queue had 2 pending Referrals but the badge stayed at 0.
        try:
            for Model in _PROGRAMS_MODELS:
                pqs = Model.objects.filter(approval_status='PENDING')
                if not request.user.can_see_all_orgs:
                    pqs = pqs.filter(organisation=request.user.organisation)
                pending_count += pqs.count()
        except (NameError, Exception):
            pass
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

        # GBV cases this month — an outcome metric senior decision-makers
        # track. Sourced from the programs GBVCase model (approved, this
        # month, org-scoped). Wrapped so the endpoint still responds if the
        # programs app is unavailable in a given test context.
        gbv_count = 0
        try:
            from programs.models import GBVCase
            gbv_qs = GBVCase.objects.filter(
                approval_status='APPROVED',
                created_at__gte=month_start, created_at__lt=month_end,
            )
            if not request.user.can_see_all_orgs:
                gbv_qs = gbv_qs.filter(organisation=request.user.organisation)
            gbv_count = gbv_qs.count()
        except Exception:
            pass

        if prev_month_count > 0:
            mom_change = round((this_month_count - prev_month_count) / prev_month_count * 100, 1)
        elif this_month_count > 0:
            mom_change = 100.0
        else:
            mom_change = 0.0

        # Cumulative programme totals — Animesh's high-level executive numbers:
        # 'Total Maternal Deaths Notified / Reviewed / Total Fistula patients
        # managed/referred to date'. Pulls from the MPDSR facility aggregates
        # (Sayeed's Excel ingest) and FistulaCornerCase counts.
        total_md_notified = 0
        total_md_reviewed = 0
        total_nd_notified = 0
        total_nd_reviewed = 0
        total_fistula_patients = 0
        total_fistula_referred = 0
        total_stillbirths_notified = 0
        total_stillbirths_reviewed = 0
        try:
            from mpdsr.models import MPDSRFacilityCount
            from django.db.models import Sum
            agg = MPDSRFacilityCount.objects.aggregate(
                md_n=Sum('fdn_md'), md_r=Sum('fdr_md'),
                nd_n=Sum('fdn_nd'), nd_r=Sum('fdr_nd'),
                sb_n=Sum('fdn_sb'), sb_r=Sum('fdr_sb'),
            )
            total_md_notified = int(agg.get('md_n') or 0)
            total_md_reviewed = int(agg.get('md_r') or 0)
            total_nd_notified = int(agg.get('nd_n') or 0)
            total_nd_reviewed = int(agg.get('nd_r') or 0)
            total_stillbirths_notified = int(agg.get('sb_n') or 0)
            total_stillbirths_reviewed = int(agg.get('sb_r') or 0)
        except Exception:
            pass
        try:
            from fistula.models import FistulaCornerCase
            total_fistula_patients = FistulaCornerCase.objects.count()
            total_fistula_referred = FistulaCornerCase.objects.exclude(
                referral_date__isnull=True,
            ).count() + FistulaCornerCase.objects.exclude(
                referral_outcome='',
            ).exclude(referral_date__isnull=False).count()
        except Exception:
            pass

        return Response({
            'submissions_this_month': this_month_count,
            'submissions_pending': pending_count,
            'active_workers': active_workers,
            'fistula_cases_this_month': fistula_count,
            'mpdsr_cases_this_month': mpdsr_count,
            'gbv_cases_this_month': gbv_count,
            'previous_month_submissions': prev_month_count,
            'mom_change_percent': mom_change,
            'target_attainment': None,  # wired up when tracker app is complete
            # Cumulative high-level metrics (Animesh's spec)
            'total_md_notified': total_md_notified,
            'total_md_reviewed': total_md_reviewed,
            'total_nd_notified': total_nd_notified,
            'total_nd_reviewed': total_nd_reviewed,
            'total_fistula_patients': total_fistula_patients,
            'total_fistula_referred': total_fistula_referred,
            'total_stillbirths_notified': total_stillbirths_notified,
            'total_stillbirths_reviewed': total_stillbirths_reviewed,
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
    permission_classes = [IsSupervisorOrManager]

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
# Activity-by-category breakdown (homepage donut). Counts every programs
# submission grouped into Clinical / Community / Operations, org-scoped.
# One light .count() per model (~17) — no per-month loops.
# ---------------------------------------------------------------------------

# Which service category each programs model rolls up into.
_CATEGORY_OF = {
    'ClinicVisit': 'Clinical', 'HIVSTITestResult': 'Clinical', 'ADRRecord': 'Clinical',
    'AutoclaveLog': 'Clinical', 'AntenatalCard': 'Clinical', 'HTCCounselling': 'Clinical',
    'MHScreening': 'Clinical',
    'GBVCase': 'Community', 'OutreachSession': 'Community', 'GroupEducationSession': 'Community',
    'Referral': 'Community', 'SafetyHygieneKit': 'Community', 'IndividualCounselling': 'Community',
    'IECMaterial': 'Community',
    'TrainingEvent': 'Operations', 'CoordMeeting': 'Operations', 'MobileHealthCamp': 'Operations',
}



class ActivityBreakdownView(APIView):
    """
    GET /api/dashboard/activity-breakdown/
    Approved + pending programme submissions grouped by service category
    (Clinical / Community / Operations), org-scoped. Drives the homepage
    activity-by-category donut.
    """
    permission_classes = [IsSupervisorOrManager]

    def get(self, request):
        partners = allowed_partners(request.user)
        categories = {'Clinical': 0, 'Community': 0, 'Operations': 0}

        try:
            from programs.models import (
                ClinicVisit, HIVSTITestResult, ADRRecord, AutoclaveLog, AntenatalCard,
                HTCCounselling, IndividualCounselling, MHScreening, GBVCase,
                OutreachSession, GroupEducationSession, Referral, SafetyHygieneKit,
                TrainingEvent, CoordMeeting, MobileHealthCamp, IECMaterial,
            )
            models = [
                ClinicVisit, HIVSTITestResult, ADRRecord, AutoclaveLog, AntenatalCard,
                HTCCounselling, IndividualCounselling, MHScreening, GBVCase,
                OutreachSession, GroupEducationSession, Referral, SafetyHygieneKit,
                TrainingEvent, CoordMeeting, MobileHealthCamp, IECMaterial,
            ]
            for Model in models:
                cat = _CATEGORY_OF.get(Model.__name__)
                if not cat:
                    continue
                try:
                    n = (
                        Model.objects
                        .filter(approval_status__in=['APPROVED', 'PENDING'],
                                organisation__in=partners)
                        .count()
                    )
                    categories[cat] += n
                except Exception:
                    continue
        except Exception:
            pass

        total = sum(categories.values())
        return Response({'categories': categories, 'total': total})


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
    permission_classes = [IsSupervisorOrManager]

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
    permission_classes = [IsSupervisorOrManager]

    def get(self, request):
        import datetime as _dt
        from django.db.models.functions import TruncDate

        month_start, month_end = current_month_bounds()
        now = timezone.now()

        partner = request.query_params.get('partner', '')
        month_qs = (
            _base_qs(request.user)
            .filter(submitted_at__gte=month_start, submitted_at__lt=month_end)
            .exclude(district='')
        )
        if partner and partner in allowed_partners(request.user):
            month_qs = month_qs.filter(partner=partner)

        rows = (
            month_qs
            .values('district')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        # 14-day daily trend per district — feeds the sparkline column.
        trend_start = now - _dt.timedelta(days=14)
        trend_qs = (
            _base_qs(request.user)
            .filter(submitted_at__gte=trend_start)
            .exclude(district='')
        )
        if partner and partner in allowed_partners(request.user):
            trend_qs = trend_qs.filter(partner=partner)

        per_day = (
            trend_qs
            .annotate(day=TruncDate('submitted_at'))
            .values('district', 'day')
            .annotate(c=Count('id'))
        )
        trend_map: dict[str, dict] = {}
        for r in per_day:
            trend_map.setdefault(r['district'], {})[r['day']] = r['c']

        # Build a 14-slot vector per district, oldest → newest.
        today = now.date()
        day_axis = [today - _dt.timedelta(days=i) for i in range(13, -1, -1)]

        districts = []
        for rank, row in enumerate(rows, start=1):
            d = row['district']
            trend = [trend_map.get(d, {}).get(day, 0) for day in day_axis]
            districts.append({
                'district': d,
                'count': row['count'],
                'rank': rank,
                'trend': trend,
            })

        # Authoritative centre count for the hero lede ("submitting from N
        # centres"). The `districts` list above is derived from legacy
        # KoboSubmission rows and is empty for partners whose data flows through
        # the programs models — which made the hero read "0 centres" next to a
        # 9-centre map. Count the partner's ACTIVE ServiceCenters instead, the
        # same source SL8 uses, so the number is real and consistent everywhere.
        from programs.models import ServiceCenter
        centre_qs = ServiceCenter.objects.filter(
            is_active=True, organisation__in=allowed_partners(request.user))
        if partner and partner in allowed_partners(request.user):
            centre_qs = centre_qs.filter(organisation=partner)
        total_centres = centre_qs.count()

        return Response({
            'month': now.strftime('%B %Y'),
            'districts': districts,
            'total_centres': total_centres,
        })


# ---------------------------------------------------------------------------
# Partner aggregate (super admins only)
# ---------------------------------------------------------------------------

class PartnerSummaryView(APIView):
    """
    GET /api/dashboard/partner-summary/
    Side-by-side PHD vs Bandhu KPIs — super admin / developer only.
    """
    permission_classes = [IsSupervisorOrOrgLead]

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
    permission_classes = [IsSupervisorOrManager]

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
    permission_classes = [IsSupervisorOrManager]

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
    permission_classes = [IsSupervisorOrManager]

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
    permission_classes = [IsSupervisorOrManager]

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
    permission_classes = [IsSupervisorOrManager]

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
    permission_classes = [IsSupervisorOrManager]

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
    permission_classes = [IsSupervisorOrManager]

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


# ─── Programme Health Flag ───────────────────────────────────────────────────


class ProgrammeHealthFlagView(APIView):
    """GET /api/dashboard/health-flags/

    Per-partner daily-submission compliance. Animesh's spec: every centre
    must touch the platform once per day, even with a '0' entry. The flag
    surfaces who's silent.

    Returns:
      {
        "as_of": "2026-06-01T13:58:00Z",
        "alert_threshold_hours": 24,
        "partners": [
          {
            "partner": "PHD",
            "total_centres": 11,
            "submitted_today": 7,
            "silent_count": 4,
            "silent_centres": [
              { "name": ..., "district": ..., "hours_silent": 47.2 },
              ...
            ]
          },
          ...
        ]
      }
    """
    # UNFPA-only surface per Animesh: programme managers see compliance
    # across all partners. Developers retained for support visibility.
    permission_classes = [IsSupervisorOrManager]

    # Animesh's spec (revised 2026-06-01) — 24-hour daily reporting window.
    # If a centre hasn't submitted anything in the past 24 hours, it
    # surfaces on the 'Daily reporting update' card as silent for today.
    ALERT_THRESHOLD_HOURS = 24

    def get(self, request):
        from programs.models.center import ServiceCenter

        user = request.user
        # Compliance visibility (revised): every reviewer sees the daily
        # reporting flag, but scoped to the partners they're allowed to see.
        # UNFPA/CIPRB get all three (monitoring orgs); a PHD/Bandhu manager
        # or focal sees only their own partner's card. This is what lets
        # managers confirm their own daily reporting duty was met.
        visible = allowed_partners(user)

        # "Today" is the local (Asia/Dhaka) calendar day, not UTC — a centre
        # that reported at 9am Dhaka must read as "reported today".
        now = timezone.now()
        local_now = timezone.localtime(now)
        today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        threshold_dt = now - datetime.timedelta(hours=self.ALERT_THRESHOLD_HOURS)

        partners_data = []
        # Stable card order; filtered to the partners this user may see.
        for partner in [p for p in ('PHD', 'Bandhu', 'CIPRB') if p in visible]:
            centres = list(ServiceCenter.objects.filter(
                organisation=partner, is_active=True,
            ))
            total = len(centres)

            # Recent submissions in the 74-hour window — used for the
            # partner-level 'silent' flag (no activity at all).
            recent_qs = KoboSubmission.objects.filter(
                partner=partner, submitted_at__gte=threshold_dt,
            )
            todays_qs = KoboSubmission.objects.filter(
                partner=partner, submitted_at__gte=today_start,
            )
            recent_submissions = recent_qs.count()
            todays_submissions = todays_qs.count()
            # How many of today's touches were explicit zero/no-activity
            # reports — surfaced so the card can show "reported today
            # (no activity)" rather than implying clinical volume.
            todays_zero_reports = todays_qs.filter(is_zero_report=True).count()

            # Per-centre granularity — Animesh's 'X of N centres submitted
            # today' breakdown. Uses denormalised centre_code on
            # KoboSubmission so we can count without a join.
            todays_centre_codes = set(
                todays_qs.exclude(centre_code='')
                         .values_list('centre_code', flat=True)
                         .distinct()
            )
            recent_centre_codes = set(
                recent_qs.exclude(centre_code='')
                         .values_list('centre_code', flat=True)
                         .distinct()
            )

            last_submission = (
                KoboSubmission.objects
                .filter(partner=partner)
                .order_by('-submitted_at')
                .values_list('submitted_at', flat=True)
                .first()
            )

            # Merge in PROGRAMS submissions. The partners' live field data lives
            # in the programs models, NOT the legacy KoboSubmission table queried
            # above, so the legacy-only counts read 0/silent for them otherwise.
            # Counts all statuses — submitting is "reporting"; approval is separate.
            from tracker.programs_query import daily_reporting_activity
            p_recent, p_today, p_today_codes, p_last = daily_reporting_activity(
                partner, threshold_dt, today_start,
            )
            recent_submissions += p_recent
            todays_submissions += p_today
            todays_centre_codes |= p_today_codes
            if p_last and (last_submission is None or p_last > last_submission):
                last_submission = p_last

            partner_silent_hours = None
            if last_submission:
                partner_silent_hours = round(
                    (now - last_submission).total_seconds() / 3600.0, 1,
                )

            # Partner is silent only if NO centre has touched the platform
            # inside the 74-hour window.
            is_silent = recent_submissions == 0

            # Per-centre silence list: centres that have NOT submitted today.
            # Used by the dashboard drill-down so managers see exactly which
            # field sites to chase.
            silent_centres = []
            submitted_today_count = 0
            for c in centres:
                if c.code in todays_centre_codes:
                    submitted_today_count += 1
                else:
                    # Compute hours silent for this specific centre.
                    last_for_centre = (
                        KoboSubmission.objects
                        .filter(partner=partner, centre_code=c.code)
                        .order_by('-submitted_at')
                        .values_list('submitted_at', flat=True)
                        .first()
                    )
                    centre_hrs = (
                        round((now - last_for_centre).total_seconds() / 3600.0, 1)
                        if last_for_centre else None
                    )
                    silent_centres.append({
                        'name': c.name,
                        'district': c.district,
                        'hours_silent': centre_hrs,
                    })

            silent_count = total - submitted_today_count

            partners_data.append({
                'partner': partner,
                'total_centres': total,
                'submitted_today': submitted_today_count,
                'silent_count': silent_count,
                'submissions_today': todays_submissions,
                'zero_reports_today': todays_zero_reports,
                'recent_submissions': recent_submissions,
                'last_submission_at': last_submission.isoformat() if last_submission else None,
                'partner_silent_hours': partner_silent_hours,
                'is_silent': is_silent,
                'silent_centres': silent_centres,
            })

        return Response({
            'as_of': now.isoformat(),
            'alert_threshold_hours': self.ALERT_THRESHOLD_HOURS,
            'partners': partners_data,
        })
