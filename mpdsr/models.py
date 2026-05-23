import datetime
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class ReviewStatus(models.TextChoices):
    REPORTED = 'reported', 'Reported'
    UNDER_REVIEW = 'under_review', 'Under Review'
    COMMITTEE_REVIEW = 'committee_review', 'Committee Review'
    ACTION_PLAN_DRAFTED = 'action_plan_drafted', 'Action Plan Drafted'
    CLOSED = 'closed', 'Closed'


class DeathType(models.TextChoices):
    MATERNAL = 'maternal', 'Maternal Death'
    PERINATAL = 'perinatal', 'Perinatal Death'


def _safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class MPDSRCaseManager(models.Manager):
    def get_or_create_from_submission(self, submission):
        """
        Called by submissions.signals when an MPDSR form submission is approved.
        Field names in raw_data are placeholders — CIPRB will confirm exact
        KoboToolbox XLS form field names before go-live.
        """
        raw = submission.raw_data
        death_type_raw = (raw.get('death_type') or '').lower()
        if 'perinatal' in death_type_raw:
            death_type = DeathType.PERINATAL
        else:
            death_type = DeathType.MATERNAL

        obj, created = self.get_or_create(
            submission=submission,
            defaults={
                'partner': submission.partner,
                'district': submission.district,
                'region': submission.region,
                'latitude': submission.latitude,
                'longitude': submission.longitude,
                'date_of_death': submission.submitted_at.date(),
                'death_type': death_type,
                'cause_of_death': raw.get('cause_of_death') or '',
                'facility_name': raw.get('facility_name') or '',
                'age_years': _safe_int(raw.get('age_years')),
                'status': ReviewStatus.REPORTED,
            },
        )
        return obj, created


class MPDSRCase(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_hash = models.CharField(max_length=30, unique=True, blank=True, db_index=True)

    submission = models.OneToOneField(
        'submissions.KoboSubmission',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='mpdsr_case',
    )
    partner = models.CharField(max_length=20, db_index=True)
    district = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    date_of_death = models.DateField()
    death_type = models.CharField(
        max_length=20,
        choices=DeathType.choices,
        default=DeathType.MATERNAL,
        db_index=True,
    )
    cause_of_death = models.CharField(max_length=300, blank=True)
    facility_name = models.CharField(max_length=200, blank=True)
    age_years = models.PositiveSmallIntegerField(null=True, blank=True)

    status = models.CharField(
        max_length=30,
        choices=ReviewStatus.choices,
        default=ReviewStatus.REPORTED,
        db_index=True,
    )
    committee_date = models.DateField(null=True, blank=True)
    action_plan = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='mpdsr_cases_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = MPDSRCaseManager()

    class Meta:
        ordering = ['-date_of_death', '-created_at']
        verbose_name = 'MPDSR Case'
        verbose_name_plural = 'MPDSR Cases'
        indexes = [
            models.Index(fields=['partner', 'status']),
            models.Index(fields=['death_type', 'partner']),
        ]

    def save(self, *args, **kwargs):
        if not self.case_hash:
            year = self.date_of_death.year if self.date_of_death else timezone.now().year
            prefix = 'PHD' if self.partner == 'PHD' else 'BON'
            type_code = 'MAT' if self.death_type == DeathType.MATERNAL else 'PER'
            count = (
                MPDSRCase.objects
                .filter(partner=self.partner, date_of_death__year=year)
                .count() + 1
            )
            self.case_hash = f'MPDSR-{prefix}-{type_code}-{year}-{count:04d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.case_hash} ({self.get_death_type_display()})'

    @property
    def is_overdue_committee(self) -> bool:
        """True when committee review is scheduled but date has passed and not yet closed."""
        if self.status == ReviewStatus.CLOSED:
            return False
        if not self.committee_date:
            return False
        return self.committee_date < datetime.date.today()
