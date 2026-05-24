import calendar
from datetime import date, timedelta

from django.core.files.base import ContentFile
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsSuperAdminOrManager
from submissions.models import FormType
from .anomaly import submission_anomalies_for_partner
from .ai_narrative import generate_narrative, generate_newsletter_narrative
from .models import Report, ReportFormat, ReportType, PeriodType
from .serializers import GenerateReportSerializer, ReportSerializer
from .generators.data import collect_programme_data


def _compute_period(
    period_type: str,
    year: int | None,
    month: int | None,
    period_start: date | None,
    period_end: date | None,
) -> tuple[date, date]:
    """Compute (period_start, period_end) from the submitted parameters."""
    today = timezone.now().date()

    if period_type == PeriodType.BIWEEKLY:
        ps = period_start or (today - timedelta(days=14))
        pe = period_end   or today
        return ps, pe

    if period_type == PeriodType.QUARTERLY:
        # Anchor to end of the given month; start is 3 calendar months before
        y = year  or today.year
        m = month or today.month
        pe = date(y, m, calendar.monthrange(y, m)[1])
        # Go back 3 months
        sm = m - 3
        sy = y
        if sm <= 0:
            sm += 12
            sy -= 1
        ps = date(sy, sm, 1)
        return ps, pe

    # Default: monthly
    y = year  or today.year
    m = month or today.month
    ps = date(y, m, 1)
    pe = date(y, m, calendar.monthrange(y, m)[1])
    return ps, pe


def _period_label(period_type: str, ps: date, pe: date) -> str:
    labels = {
        PeriodType.BIWEEKLY:  f'{ps.day} {ps.strftime("%b")} – {pe.day} {pe.strftime("%b %Y")}',
        PeriodType.QUARTERLY: f'{ps.strftime("%b")} – {pe.strftime("%b %Y")}',
        PeriodType.MONTHLY:   ps.strftime('%B %Y'),
    }
    return labels.get(period_type, f'{ps} – {pe}')


def _generate_file(
    report_type: str,
    fmt: str,
    data: dict,
    narrative: str,
    title: str,
) -> tuple[bytes, str]:
    """Dispatch to the correct generator and return (bytes, content_type)."""

    if fmt == ReportFormat.PDF:
        if report_type == ReportType.ONE_PAGER:
            from .generators.one_pager import build_infographic
            return build_infographic(data, narrative), 'application/pdf'

        if report_type == ReportType.NEWSLETTER:
            from .generators.newsletter import build_newsletter
            return build_newsletter(data=data, narrative=narrative), 'application/pdf'

        # monthly_summary
        from .generators.pdf import build_summary_pdf
        rows = [(k['label'], k['value']) for k in data.get('top_kpis', [])]
        return build_summary_pdf(title, rows, narrative), 'application/pdf'

    if fmt == ReportFormat.DOCX:
        from .generators.word import build_summary_docx
        rows = [(k['label'], k['value']) for k in data.get('top_kpis', [])]
        return (
            build_summary_docx(title, rows, narrative),
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )

    if fmt == ReportFormat.PPTX:
        from .generators.pptx import build_presentation
        return (
            build_presentation(data, narrative),
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        )

    raise ValueError(f'Unknown format: {fmt}')


class ReportViewSet(ModelViewSet):
    queryset = Report.objects.all()
    serializer_class = ReportSerializer
    permission_classes = [IsSuperAdminOrManager]
    http_method_names = ['get', 'head', 'options', 'post', 'delete']

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.can_see_all_orgs:
            qs = qs.filter(partner=user.organisation)
        return qs

    @action(detail=False, methods=['post'])
    def generate(self, request):
        serializer = GenerateReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        partner      = d.get('partner', '')
        period_type  = d.get('period_type', PeriodType.MONTHLY)
        fmt          = d['format']
        report_type  = d['report_type']

        # Restrict partner for non-super-admins
        if not request.user.can_see_all_orgs:
            partner = request.user.organisation

        ps, pe = _compute_period(
            period_type,
            d.get('year'),
            d.get('month'),
            d.get('period_start'),
            d.get('period_end'),
        )

        period_lbl = _period_label(period_type, ps, pe)
        title = (
            f'{ReportType(report_type).label} — '
            f'{partner or "All Partners"} · {period_lbl}'
        )

        # Collect data from programs models
        prog_data = collect_programme_data(ps, pe, partner)
        prog_data['organisation'] = partner or 'All Partners'
        prog_data['period_label'] = period_lbl

        # AI narrative
        narrative = ''
        if d.get('include_narrative', True):
            ai_context = {
                'organisation':     prog_data['organisation'],
                'period':           period_lbl,
                'total_activities': prog_data['total_submissions'],
                **prog_data['counts'],
                'fistula_cases':    prog_data['fistula_cases'],
                'mpdsr_cases':      prog_data['mpdsr_cases'],
            }
            if report_type == ReportType.NEWSLETTER:
                narrative = generate_newsletter_narrative(ai_context)
            else:
                narrative = generate_narrative(ai_context)

        file_bytes, content_type = _generate_file(report_type, fmt, prog_data, narrative, title)

        ext      = {'pdf': 'pdf', 'docx': 'docx', 'pptx': 'pptx'}[fmt]
        filename = (
            f'{report_type}_{partner or "all"}_{period_type}'
            f'_{ps.strftime("%Y%m%d")}_{pe.strftime("%Y%m%d")}.{ext}'
        )

        report = Report.objects.create(
            report_type  = report_type,
            format       = fmt,
            partner      = partner,
            year         = ps.year,
            month        = ps.month,
            period_type  = period_type,
            period_start = ps,
            period_end   = pe,
            title        = title,
            narrative    = narrative[:2000] if narrative else '',
            generated_by = request.user,
        )
        report.file.save(filename, ContentFile(file_bytes), save=True)

        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        report = self.get_object()
        if not report.file:
            return Response({'detail': 'No file attached.'}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(report.file.open('rb'), as_attachment=True,
                            filename=report.file.name.split('/')[-1])

    @action(detail=False, methods=['get'])
    def anomalies(self, request):
        partner   = request.query_params.get('partner', '')
        form_type = request.query_params.get('form_type', FormType.MPDSR)
        try:
            year = int(request.query_params.get('year', timezone.now().year))
        except (ValueError, TypeError):
            year = timezone.now().year

        results = submission_anomalies_for_partner(partner, form_type, year)
        return Response({'year': year, 'partner': partner,
                         'form_type': form_type, 'anomalies': results})
