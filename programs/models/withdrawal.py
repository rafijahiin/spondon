"""Audit trail for records removed because they were deleted in KoboToolbox.

A deletion that leaves no trace is indistinguishable from data loss. Every row
removed by programs.kobo_withdrawals is written here first, with a snapshot of
the record, so any figure that changes can be explained afterwards and, if the
deletion was a mistake, the record can be rebuilt from the snapshot.

This table is never written by the webhook or by a user; only the reconciliation
command writes it.
"""
from django.db import models

from ._base import TimestampedModel


class KoboWithdrawal(TimestampedModel):
    model_label = models.CharField(max_length=100, db_index=True)
    record_pk = models.CharField(max_length=64)
    kobo_submission_id = models.CharField(max_length=100, db_index=True)
    organisation = models.CharField(max_length=50, blank=True)
    # The approval state the record held when it was removed. A record that was
    # already APPROVED had been counted in reports, so its removal changes
    # published figures and needs to be findable later.
    approval_status = models.CharField(max_length=20, blank=True)
    snapshot = models.JSONField(default=dict, blank=True)
    actor = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ('-created_at',)
        verbose_name = 'Kobo withdrawal'

    def __str__(self):
        return '%s %s (kobo %s)' % (self.model_label, self.record_pk,
                                    self.kobo_submission_id)
