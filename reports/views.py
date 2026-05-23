import calendar

from django.core.files.base import ContentFile
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsSuperAdminOrManager
from submissions.models import FormType, KoboSubmission, SubmissionStatus
from .anomaly import submission_anomalies_for_partner
from .ai_narrative import generate_narrative
from .models import Report, ReportFormat, ReportType
from .serializers import GenerateReportSerializer, ReportSerializer


def _collect_kpis(partner: str, year: int, month: int) -> list[tuple]:
    """Return (label, value) rows for the report table."""
    qs = KoboSubmission.objects.filter(status=SubmissionStatus.APPROVED,
                                       submitted_at__year=year, submitted_at__month=month)
    if partner:
        qs = qs.filter(partner=partner)

    rows = [
        ('Total Approved Submissions', qs.count()),
        ('MPDSR Cases', qs.filter(form_type=FormType.MPDSR).count()),
        ('Fistula Cases', qs.filter(form_type=FormType.FISTULA).count()),
        ('Activity Reports', qs.filter(form_type=FormType.ACTIVITY).count()),
        ('Period', f'{calendar.month_name[month]} {year}'),
    ]
    if partner:
        rows.insert(0, ('Partner', partner))
    return rows


def _generate_file(report_type: str, fmt: str, title: str,
                   rows: list[tuple], narrative: str) -> tuple[bytes, str]:
    """Return (file_bytes, content_type)."""
    if fmt == ReportFormat.PDF:
        if report_type == ReportType.ONE_PAGER:
            from .generators.one_pager import build_one_pager
            kpis = [{'label': r[0], 'value': r[1]} for r in rows]
            data = build_one_pager(title, kpis, narrative)
        elif report_type == ReportType.NEWSLETTER:
            from .generators.newsletter import build_newsletter
            sections = [{'heading': 'Key Indicators', 'body': narrative or 'No narrative.'}]
            data = build_newsletter(title, sections)
        else:
            from .generators.pdf import build_summary_pdf
            data = build_summary_pdf(title, rows, narrative)
        return data, 'application/pdf'

    elif fmt == ReportFormat.DOCX:
        from .generators.word import build_summary_docx
        data = build_summary_docx(title, rows, narrative)
        return data, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    elif fmt == ReportFormat.PPTX:
        from .generators.pptx import build_summary_pptx
        data = build_summary_pptx(title, rows, narrative)
        return data, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

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

        partner = d['partner']
        year = d['year']
        month = d['month']
        fmt = d['format']
        report_type = d['report_type']
        title = f'{report_type.replace("_", " ").title()} — {partner or "All Partners"} {year}-{month:02d}'

        rows = _collect_kpis(partner, year, month)
        narrative = ''
        if d.get('include_narrative'):
            context = {label: value for label, value in rows}
            narrative = generate_narrative(context)

        file_bytes, content_type = _generate_file(report_type, fmt, title, rows, narrative)

        ext = {'pdf': 'pdf', 'docx': 'docx', 'pptx': 'pptx'}[fmt]
        filename = f'{report_type}_{partner or "all"}_{year}_{month:02d}.{ext}'

        report = Report.objects.create(
            report_type=report_type,
            format=fmt,
            partner=partner,
            year=year,
            month=month,
            title=title,
            narrative=narrative,
            generated_by=request.user,
        )
        report.file.save(filename, ContentFile(file_bytes), save=True)

        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        report = self.get_object()
        if not report.file:
            return Response({'detail': 'No file attached.'}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(report.file.open('rb'), as_attachment=True, filename=report.file.name)

    @action(detail=False, methods=['get'])
    def anomalies(self, request):
        partner = request.query_params.get('partner', '')
        form_type = request.query_params.get('form_type', FormType.MPDSR)
        try:
            year = int(request.query_params.get('year', timezone.now().year))
        except (ValueError, TypeError):
            year = timezone.now().year

        results = submission_anomalies_for_partner(partner, form_type, year)
        return Response({'year': year, 'partner': partner, 'form_type': form_type,
                         'anomalies': results})
