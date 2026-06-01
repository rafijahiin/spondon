import uuid
from django.conf import settings
from django.db import models


class FormType(models.TextChoices):
    MPDSR = 'mpdsr', 'MPDSR'
    FISTULA = 'fistula', 'Fistula Campaign'
    ACTIVITY = 'activity', 'Activity Report'
    BASELINE = 'baseline', 'Baseline/Endline Survey'


class SubmissionStatus(models.TextChoices):
    PENDING = 'pending', 'Pending Review'
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Rejected'


class KoboSubmission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kobo_id = models.CharField(max_length=100, unique=True)  # prevents duplicate processing
    form_type = models.CharField(max_length=20, choices=FormType.choices, db_index=True)
    partner = models.CharField(max_length=20, blank=True, db_index=True)

    # Key fields extracted for querying — full payload is in raw_data
    worker_name = models.CharField(max_length=200, blank=True)
    district = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)  # Division in Bangladesh
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)

    # Centre code — denormalised from raw_data at ingest time so per-centre
    # health-flag queries don't need to join through the JSON payload. Used by
    # the 74-hour Programme Health Flag system to show 'X of N centres
    # submitted today' granularity (Animesh's spec).
    centre_code = models.CharField(max_length=40, blank=True, db_index=True)

    submitted_at = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)
    raw_data = models.JSONField()

    status = models.CharField(
        max_length=20,
        choices=SubmissionStatus.choices,
        default=SubmissionStatus.PENDING,
        db_index=True,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_submissions',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-submitted_at']
        indexes = [
            models.Index(fields=['partner', 'status', '-submitted_at']),
            models.Index(fields=['form_type', 'status']),
        ]

    def __str__(self):
        return f'{self.get_form_type_display()} — {self.partner} — {self.submitted_at:%Y-%m-%d}'
