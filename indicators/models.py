"""
Indicator target definitions.
Targets are stored in DB so CIPRB/UNFPA can update them without a code deploy.
"""
import uuid
from django.db import models
from programs._base_choices import ORG_CHOICES


class IndicatorTarget(models.Model):
    """
    One row per indicator per organisation per programme period.
    The indicator_code must match the function name suffix in indicators/bandhu.py
    or indicators/phd.py — e.g. 'BND_1_1' maps to compute_I_BND_1_1().
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    indicator_code = models.CharField(max_length=30, db_index=True)   # e.g. 'BND_1_1'
    indicator_name = models.CharField(max_length=300)
    objective = models.CharField(max_length=10, blank=True)           # e.g. 'O1', 'O2'
    activity_ref = models.CharField(max_length=20, blank=True)        # e.g. 'A1.1'
    unit = models.CharField(max_length=50, default='count')           # count / sessions / boxes / etc.

    target_value = models.DecimalField(max_digits=12, decimal_places=2)
    period_start = models.DateField()
    period_end = models.DateField()

    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('organisation', 'indicator_code', 'period_start')]
        ordering = ['organisation', 'indicator_code']
        verbose_name = 'Indicator Target'
        verbose_name_plural = 'Indicator Targets'

    def __str__(self):
        return f'[{self.organisation}] I_{self.indicator_code} — {self.indicator_name[:60]}'
