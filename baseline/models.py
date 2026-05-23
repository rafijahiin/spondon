import uuid

from django.conf import settings
from django.db import models


class SurveyType(models.TextChoices):
    BASELINE = 'baseline', 'Baseline'
    ENDLINE = 'endline', 'Endline'


class BaselineSurvey(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    submission = models.OneToOneField(
        'submissions.KoboSubmission',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='baseline_survey',
    )
    partner = models.CharField(max_length=20, db_index=True)
    district = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    survey_type = models.CharField(
        max_length=20,
        choices=SurveyType.choices,
        default=SurveyType.BASELINE,
        db_index=True,
    )

    # Anonymised participant reference — not stored as PII
    participant_code = models.CharField(max_length=100, blank=True, db_index=True)

    date_conducted = models.DateField()
    raw_data = models.JSONField(default=dict)

    is_duplicate = models.BooleanField(default=False, db_index=True)
    duplicate_of = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='duplicates',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date_conducted', '-created_at']
        indexes = [
            models.Index(fields=['partner', 'survey_type']),
            models.Index(fields=['participant_code', 'district', 'survey_type']),
        ]

    def __str__(self):
        return f'{self.survey_type} / {self.partner} / {self.district} / {self.date_conducted}'
