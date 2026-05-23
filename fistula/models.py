import datetime
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class CaseStatus(models.TextChoices):
    IDENTIFIED = 'identified', 'Case Identified'
    ACTION_REQUIRED = 'action_required', 'Action Required'
    FOLLOWUP_PENDING = 'followup_pending', 'Follow-up Pending'
    REFERRAL_COMPLETED = 'referral_completed', 'Referral Completed'


def _safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class FistulaCaseManager(models.Manager):
    def get_or_create_from_submission(self, submission):
        """
        Called by submissions.signals when a fistula form submission is approved.
        Field names in raw_data (patient_name, patient_id, age) are placeholders —
        CIPRB will confirm exact KoboToolbox XLS form field names before go-live.
        """
        from .encryption import encrypt

        raw = submission.raw_data
        obj, created = self.get_or_create(
            submission=submission,
            defaults={
                'partner': submission.partner,
                'district': submission.district,
                'region': submission.region,
                'latitude': submission.latitude,
                'longitude': submission.longitude,
                'date_identified': submission.submitted_at.date(),
                'patient_name_enc': encrypt(raw.get('patient_name') or ''),
                'patient_id_enc': encrypt(raw.get('patient_id') or ''),
                'age': _safe_int(raw.get('age')),
                'status': CaseStatus.IDENTIFIED,
                'referral_status': raw.get('referral_status') or '',
            },
        )
        return obj, created


class FistulaCase(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_hash = models.CharField(max_length=30, unique=True, blank=True, db_index=True)

    submission = models.OneToOneField(
        'submissions.KoboSubmission',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='fistula_case',
    )
    partner = models.CharField(max_length=20, db_index=True)
    district = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    date_identified = models.DateField()

    # PII fields — values stored as Fernet-encrypted ciphertext
    patient_name_enc = models.TextField(blank=True)
    patient_id_enc = models.TextField(blank=True)

    age = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(
        max_length=30,
        choices=CaseStatus.choices,
        default=CaseStatus.IDENTIFIED,
        db_index=True,
    )
    referral_status = models.CharField(max_length=200, blank=True)
    follow_up_date = models.DateField(null=True, blank=True)

    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='fistula_cases_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = FistulaCaseManager()

    class Meta:
        ordering = ['-date_identified', '-created_at']
        indexes = [
            models.Index(fields=['partner', 'status']),
            models.Index(fields=['follow_up_date', 'status']),
        ]

    def save(self, *args, **kwargs):
        if not self.case_hash:
            year = self.date_identified.year if self.date_identified else timezone.now().year
            prefix = 'PHD' if self.partner == 'PHD' else 'BON'
            count = (
                FistulaCase.objects
                .filter(partner=self.partner, date_identified__year=year)
                .count() + 1
            )
            self.case_hash = f'FIS-{prefix}-{year}-{count:04d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.case_hash} ({self.partner})'

    @property
    def patient_name(self) -> str:
        from .encryption import decrypt
        return decrypt(self.patient_name_enc)

    @property
    def patient_id(self) -> str:
        from .encryption import decrypt
        return decrypt(self.patient_id_enc)

    @property
    def is_overdue(self) -> bool:
        if self.status == CaseStatus.REFERRAL_COMPLETED:
            return False
        if not self.follow_up_date:
            return False
        return self.follow_up_date < datetime.date.today()
