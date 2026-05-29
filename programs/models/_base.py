"""
Abstract base classes shared across all programs models.
All KoboToolbox-sourced records extend SubmissionBase.
"""
import uuid
from django.db import models
from django.conf import settings


class TimestampedModel(models.Model):
    # Audit FIX (HIGH) — created_at is indexed because the dashboard count
    # endpoints (dashboard.views.KPIView, ProgramsSummaryView via
    # tracker.programs_query.count_programs) filter on created_at__year /
    # created_at__month across every programs model, dozens of times per
    # request. Without this index those are sequential scans that degrade as
    # data grows.
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SubmissionBase(TimestampedModel):
    """
    Base for every record that originates from a KoboToolbox webhook.
    Approval flow: PENDING → APPROVED (visible in dashboard) or REJECTED.
    """
    PENDING = 'PENDING'
    APPROVED = 'APPROVED'
    REJECTED = 'REJECTED'
    APPROVAL_CHOICES = [
        (PENDING, 'Pending'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kobo_submission_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    approval_status = models.CharField(
        max_length=10, choices=APPROVAL_CHOICES, default=PENDING, db_index=True
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    # Audit FIX 15.7 — explicit FK to the user who submitted the record.
    # OrgFilterMixin uses this to restrict FIELD_STAFF to their own entries.
    # Webhook ingestion (programs/webhook.py) populates this from the
    # submitted_by_kobo_user string when a User can be resolved; manual
    # entries via the API set it from request.user in perform_create.
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
    )
    rejected_reason = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    submitted_by_kobo_user = models.CharField(max_length=100, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        abstract = True

    @property
    def is_approved(self):
        return self.approval_status == self.APPROVED

    @property
    def is_pending(self):
        return self.approval_status == self.PENDING
