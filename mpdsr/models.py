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
    PERINATAL = 'perinatal', 'Perinatal / Neonatal'


class PlaceOfDeath(models.TextChoices):
    FACILITY = 'facility', 'Health Facility'
    HOME = 'home', 'Home'
    IN_TRANSIT = 'in_transit', 'In Transit / On the Way'


# Maps sub-form name → human label (F1–F6 from MPDSR combined form)
SUB_FORM_LABELS = {
    'f1': 'F1 Community Notification',
    'f2': 'F2 Facility Notification',
    'f3': 'F3 Community Stillbirth Review',
    'f4': 'F4 Facility Maternal Death Review',
    'f5': 'F5 Facility Neonatal Death Review',
    'f6': 'F6 Facility Stillbirth Review',
}

# Sub-forms that are always perinatal/neonatal regardless of death_type field
_PERINATAL_FORMS = {'f3', 'f5', 'f6'}
# Sub-forms that are always maternal
_MATERNAL_FORMS = {'f4'}


def _safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _first(*args):
    for v in args:
        if v:
            return v
    return ''


class MPDSRCaseManager(models.Manager):
    def get_or_create_from_submission(self, submission):
        raw = submission.raw_data
        sub = (raw.get('form_type') or '').strip().lower()

        # ----- death type -----
        if sub in _PERINATAL_FORMS:
            death_type = DeathType.PERINATAL
        elif sub in _MATERNAL_FORMS:
            death_type = DeathType.MATERNAL
        else:
            # F1/F2 have an explicit death_type question
            dt_raw = (raw.get(f'{sub}_death_type') or raw.get('death_type') or '').lower()
            if dt_raw in ('stillbirth', 'neonatal', 'perinatal'):
                death_type = DeathType.PERINATAL
            else:
                death_type = DeathType.MATERNAL

        # ----- cause of death (ICD-10 select_multiple → space-separated values) -----
        cause = _first(
            raw.get('f4_probable_cause'),
            raw.get('f5_probable_cause'),
            raw.get('f6_contributing_factors'),
            raw.get('f2_cause_of_death'),
        )

        # ----- place of death -----
        place_raw = _first(
            raw.get('f1_death_place'),
            raw.get('f3_place_of_death'),
        ).lower()
        if 'home' in place_raw:
            place_of_death = PlaceOfDeath.HOME
        elif 'on_way' in place_raw or 'transit' in place_raw:
            place_of_death = PlaceOfDeath.IN_TRANSIT
        elif sub in ('f2', 'f4', 'f5', 'f6'):
            place_of_death = PlaceOfDeath.FACILITY
        elif place_raw:
            place_of_death = PlaceOfDeath.FACILITY
        else:
            place_of_death = PlaceOfDeath.FACILITY

        # ----- facility name -----
        facility_name = _first(
            raw.get('f4_facility_name'),
            raw.get('f5_facility_name'),
            raw.get('f6_facility_name'),
            raw.get('f2_facility_name'),
        )

        # ----- mother / subject age -----
        age_raw = _first(
            raw.get(f'{sub}_mother_age') if sub else None,
            raw.get('f1_mother_age'), raw.get('f2_mother_age'),
            raw.get('f3_mother_age'), raw.get('f4_mother_age'),
            raw.get('f5_mother_age'), raw.get('f6_mother_age'),
        )
        age_years = _safe_int(age_raw)

        # ----- district / upazila / union (sub-form specific) -----
        district = _first(
            raw.get(f'{sub}_district') if sub else None,
            raw.get('f1_district'), raw.get('f2_district'),
            raw.get('f3_district'), raw.get('f4_district'),
            raw.get('f5_district'), raw.get('f6_district'),
            submission.district,
        )
        upazila = _first(
            raw.get(f'{sub}_upazila') if sub else None,
            raw.get('f1_upazila'), raw.get('f3_upazila'), raw.get('f4_upazila'),
        )
        union = _first(
            raw.get(f'{sub}_union') if sub else None,
            raw.get('f1_union'), raw.get('f3_union'), raw.get('f4_union'),
        )

        obj, created = self.get_or_create(
            submission=submission,
            defaults={
                'partner': submission.partner,
                'district': district,
                'region': submission.region,
                'upazila': upazila,
                'union': union,
                'latitude': submission.latitude,
                'longitude': submission.longitude,
                'date_of_death': submission.submitted_at.date(),
                'sub_form_type': sub,
                'death_type': death_type,
                'cause_of_death': cause,
                'place_of_death': place_of_death,
                'facility_name': facility_name,
                'age_years': age_years,
                'status': ReviewStatus.REPORTED,
                'audit_trail': [],
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
    upazila = models.CharField(max_length=100, blank=True)
    union = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)

    sub_form_type = models.CharField(max_length=10, blank=True, db_index=True)
    date_of_death = models.DateField()
    death_type = models.CharField(
        max_length=20,
        choices=DeathType.choices,
        default=DeathType.MATERNAL,
        db_index=True,
    )
    cause_of_death = models.CharField(max_length=500, blank=True)
    place_of_death = models.CharField(
        max_length=20,
        choices=PlaceOfDeath.choices,
        default=PlaceOfDeath.FACILITY,
        blank=True,
    )
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
    audit_trail = models.JSONField(default=list, blank=True)

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
    def sub_form_label(self) -> str:
        return SUB_FORM_LABELS.get(self.sub_form_type, self.sub_form_type.upper())

    def add_audit_entry(self, user_email: str, action: str, notes: str = '') -> None:
        entry = {
            'timestamp': timezone.now().isoformat(),
            'user': user_email,
            'action': action,
            'notes': notes,
        }
        if self.audit_trail is None:
            self.audit_trail = []
        self.audit_trail.append(entry)

    @property
    def is_overdue_committee(self) -> bool:
        if self.status == ReviewStatus.CLOSED:
            return False
        if not self.committee_date:
            return False
        return self.committee_date < datetime.date.today()
