import datetime

from django.db.models import Count
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from rest_framework.views import APIView

from accounts.permissions import IsSuperAdmin, IsSuperAdminOrManager, OrgFilterMixin
from submissions.models import FormType
from .forecasting import attainment_percent, linear_forecast
from .models import Alert, MonthlyTarget
from .serializers import AlertSerializer, MonthlyTargetSerializer
from .programs_query import (
    PROGRAMS_REGISTRY, LEGACY_REGISTRY, CATEGORY_ORDER,
    count_programs, count_legacy,
    last_submission_programs, last_submission_legacy,
    has_recent_programs, has_recent_legacy,
)


class MonthlyTargetViewSet(ModelViewSet):
    """CRUD for monthly targets — super admins only."""
    queryset = MonthlyTarget.objects.all()
    serializer_class = MonthlyTargetSerializer
    permission_classes = [IsSuperAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        partner   = self.request.query_params.get('partner')
        form_type = self.request.query_params.get('form_type')
        year      = self.request.query_params.get('year')
        month     = self.request.query_params.get('month')
        if partner:
            qs = qs.filter(partner=partner)
        if form_type:
            qs = qs.filter(form_type=form_type)
        if year:
            qs = qs.filter(year=year)
        if month:
            qs = qs.filter(month=month)
        return qs

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


class ProgressView(APIView):
    """
    GET /api/tracker/progress/?partner=PHD&year=2026&month=5

    Returns compliance status for all form types that have a target,
    plus gap detection for the last 48 hours.
    Covers both programs models and legacy KoboSubmission.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        now = timezone.now()
        try:
            year  = int(request.query_params.get('year',  now.year))
            month = int(request.query_params.get('month', now.month))
        except (ValueError, TypeError):
            year, month = now.year, now.month

        partner_filter = request.query_params.get('partner', '')
        # Non-super-admins can only see their own org
        if not request.user.can_see_all_orgs:
            partner_filter = request.user.organisation

        cutoff_48h = now - datetime.timedelta(hours=48)

        # Fetch all active targets for this period
        targets_qs = MonthlyTarget.objects.filter(year=year, month=month)
        if partner_filter:
            targets_qs = targets_qs.filter(partner=partner_filter)

        # Build lookup: (partner, form_type) → target value
        target_map = {(t.partner, t.form_type): t.target for t in targets_qs}

        # Determine which (partner, form_type) combinations to report
        orgs = [partner_filter] if partner_filter else ['PHD', 'Bondhu']
        rows = []

        for form_type_key, reg in PROGRAMS_REGISTRY.items():
            model_name, label_en, label_bn, category = reg
            for org in orgs:
                target   = target_map.get((org, form_type_key))
                actual   = count_programs(form_type_key, org, year, month)
                has_gap  = not has_recent_programs(form_type_key, org, cutoff_48h)
                last_sub = last_submission_programs(form_type_key, org)

                if target is None:
                    pct    = None
                    status_val = 'no_target'
                else:
                    pct        = round(actual / target * 100, 1) if target > 0 else 100.0
                    if pct >= 80:
                        status_val = 'on_track'
                    elif pct >= 50:
                        status_val = 'behind'
                    else:
                        status_val = 'critical'

                rows.append({
                    'form_type':          form_type_key,
                    'form_label':         label_en,
                    'form_label_bn':      label_bn,
                    'category':           category,
                    'partner':            org,
                    'target':             target,
                    'actual':             actual,
                    'attainment_percent': pct,
                    'status':             status_val,
                    'has_gap':            has_gap,
                    'last_submission':    last_sub.isoformat() if last_sub else None,
                })

        # Legacy form types with targets
        for form_type_key, (label_en, label_bn, category) in LEGACY_REGISTRY.items():
            for org in orgs:
                target   = target_map.get((org, form_type_key))
                actual   = count_legacy(form_type_key, org, year, month)
                has_gap  = not has_recent_legacy(form_type_key, org, cutoff_48h)
                last_sub = last_submission_legacy(form_type_key, org)

                if target is None:
                    pct        = None
                    status_val = 'no_target'
                else:
                    pct        = round(actual / target * 100, 1) if target > 0 else 100.0
                    status_val = (
                        'on_track' if pct >= 80
                        else 'behind' if pct >= 50
                        else 'critical'
                    )

                rows.append({
                    'form_type':          form_type_key,
                    'form_label':         label_en,
                    'form_label_bn':      label_bn,
                    'category':           category,
                    'partner':            org,
                    'target':             target,
                    'actual':             actual,
                    'attainment_percent': pct,
                    'status':             status_val,
                    'has_gap':            has_gap,
                    'last_submission':    last_sub.isoformat() if last_sub else None,
                })

        # Sort: category order, then form type, then partner
        cat_idx = {c: i for i, c in enumerate(CATEGORY_ORDER)}
        rows.sort(key=lambda r: (cat_idx.get(r['category'], 99), r['form_type'], r['partner']))

        # Summary counts
        summary = {
            'on_track': sum(1 for r in rows if r['status'] == 'on_track'),
            'behind':   sum(1 for r in rows if r['status'] == 'behind'),
            'critical': sum(1 for r in rows if r['status'] == 'critical'),
            'no_target':sum(1 for r in rows if r['status'] == 'no_target'),
            'with_gap': sum(1 for r in rows if r['has_gap']),
        }

        return Response({
            'year':    year,
            'month':   month,
            'partner': partner_filter or 'all',
            'results': rows,
            'summary': summary,
        })


class ForecastView(APIView):
    """
    GET /api/tracker/forecast/?partner=PHD&form_type=mpdsr&periods=3
    Returns last 6 months actual counts + N-period linear-trend forecast.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        from submissions.models import KoboSubmission, SubmissionStatus

        partner   = request.query_params.get('partner', '')
        form_type = request.query_params.get('form_type', FormType.MPDSR)
        try:
            periods = min(int(request.query_params.get('periods', 3)), 12)
        except (ValueError, TypeError):
            periods = 3

        now = timezone.now()
        history = []
        for offset in range(5, -1, -1):
            month_num  = (now.month - 1 - offset) % 12 + 1
            year_adj   = (now.month - 1 - offset) // 12
            year       = now.year - year_adj

            if form_type in PROGRAMS_REGISTRY:
                cnt = count_programs(form_type, partner, year, month_num)
            else:
                cnt = count_legacy(form_type, partner, year, month_num)

            history.append({'year': year, 'month': month_num, 'actual': cnt})

        counts    = [h['actual'] for h in history]
        forecasted = linear_forecast(counts, periods_ahead=periods)

        for i, value in enumerate(forecasted, start=1):
            month_num = (now.month - 1 + i) % 12 + 1
            year      = now.year + (now.month - 1 + i) // 12
            history.append({'year': year, 'month': month_num, 'forecast': value})

        current_target = MonthlyTarget.objects.filter(
            partner=partner or '',
            form_type=form_type,
            year=now.year,
            month=now.month,
        ).first()
        attainment = None
        if current_target:
            attainment = attainment_percent(counts[-1], current_target.target)

        return Response({
            'partner':           partner,
            'form_type':         form_type,
            'history':           history,
            'attainment_percent': attainment,
        })


class ComplianceView(APIView):
    """
    Legacy endpoint: GET /api/tracker/compliance/
    Kept for backward compat — use /progress/ for the full tracker view.
    """
    permission_classes = [IsSuperAdminOrManager]

    def get(self, request):
        now = timezone.now()
        try:
            year  = int(request.query_params.get('year',  now.year))
            month = int(request.query_params.get('month', now.month))
        except (ValueError, TypeError):
            year, month = now.year, now.month

        partner_filter = request.query_params.get('partner', '')
        targets = MonthlyTarget.objects.filter(year=year, month=month)
        if partner_filter:
            targets = targets.filter(partner=partner_filter)

        results = []
        for t in targets:
            if t.form_type in PROGRAMS_REGISTRY:
                actual = count_programs(t.form_type, t.partner, year, month)
            else:
                actual = count_legacy(t.form_type, t.partner, year, month)

            pct = round(actual / t.target * 100, 1) if t.target > 0 else 100.0
            traffic_light = (
                'on_track' if pct >= 80
                else 'behind' if pct >= 50
                else 'critical'
            )
            results.append({
                'partner':            t.partner,
                'form_type':          t.form_type,
                'year':               year,
                'month':              month,
                'target':             t.target,
                'actual':             actual,
                'attainment_percent': pct,
                'status':             traffic_light,
            })

        return Response({'year': year, 'month': month, 'results': results})
