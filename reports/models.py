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
    ONE_PAGER = 'one_pager', 'One-Pager'
    NEWSLETTER = 'newsletter', 'Newsletter'


class Report(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report_type = models.CharField(max_length=30, choices=ReportType.choices, db_index=True)
    format = models.CharField(max_length=10, choices=ReportFormat.choices)
    partner = models.CharField(max_length=20, blank=True, db_index=True)

    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()

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
