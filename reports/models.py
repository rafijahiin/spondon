import uuid

from django.conf import settings
from django.db import models

from submissions.models import FormType


class ReportFormat(models.TextChoices):
    PDF = 'pdf', 'PDF'
    DOCX = 'docx', 'Word Document'
    PPTX = 'pptx', 'PowerPoint'


class ReportType(models.TextChoices):
    MONTHLY_SUMMARY = 'monthly_summary', 'Monthly Summary'
    ONE_PAGER = 'one_pager', 'Infographic'
    NEWSLETTER = 'newsletter', 'Newsletter'


class PeriodType(models.TextChoices):
    BIWEEKLY  = 'biweekly',  'Bi-Weekly'
    MONTHLY   = 'monthly',   'Monthly'
    QUARTERLY = 'quarterly', 'Quarterly'


class Report(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report_type = models.CharField(max_length=30, choices=ReportType.choices, db_index=True)
    format = models.CharField(max_length=10, choices=ReportFormat.choices)
    partner = models.CharField(max_length=20, blank=True, db_index=True)

    # Legacy period fields (kept for backward compat)
    year = models.PositiveSmallIntegerField(default=2026)
    month = models.PositiveSmallIntegerField(default=1)

    # New period fields
    period_type  = models.CharField(
        max_length=10, choices=PeriodType.choices,
        default=PeriodType.MONTHLY, db_index=True,
    )
    period_start = models.DateField(null=True, blank=True)
    period_end   = models.DateField(null=True, blank=True)

    title = models.CharField(max_length=300)
    narrative = models.TextField(blank=True)
    file = models.FileField(upload_to='reports/%Y/%m/', null=True, blank=True)

    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='reports_generated',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['partner', 'year', 'month']),
        ]

    def __str__(self):
        return f'{self.title} ({self.format})'
