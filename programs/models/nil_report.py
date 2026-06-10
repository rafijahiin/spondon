"""
NilReport — a "No reporting today" record.

When a Bandhu Wellness Centre has no field upload for a day, the Bandhu
manager logs a nil-report in-system (centre + date + reason) so missing days
are explained rather than silently blank. It follows the SAME two-stage
approval as Bandhu data: the manager creates it (manager gate done), then a
UNFPA user approves it (final gate) before it counts in the reporting /
compliance view.

Extends SubmissionBase only for the approval machinery + audit fields; it is
NOT a KoboToolbox webhook record (created via the API), so kobo_submission_id
stays null.
"""
from django.db import models

from ._base import SubmissionBase
from .._base_choices import ORG_CHOICES


class NilReport(SubmissionBase):
    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='nil_reports',
    )
    report_date = models.DateField(db_index=True)
    reason = models.TextField()

    class Meta:
        ordering = ['-report_date', '-created_at']
        indexes = [
            models.Index(fields=['organisation', '-report_date']),
        ]
        # One nil-report per centre per day (a centre either reported or it
        # didn't). Null centre allowed for org-wide nil days.
        constraints = [
            models.UniqueConstraint(
                fields=['organisation', 'center', 'report_date'],
                name='uniq_nil_report_per_centre_day',
            ),
        ]

    def __str__(self):
        return f'No report — {self.organisation} / {self.center or "all"} ({self.report_date})'
