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


# Maps sub-form name → human label (F1–F6 from MPDSR combined form,
# plus the review types Animesh specified in the 2026-06-02 meeting:
# Community MD Review (CDN) via verbal autopsy, Facility MD Review (FDR),
# and Social Autopsy).
SUB_FORM_LABELS = {
    'f1': 'F1 Community Notification',
    'f2': 'F2 Facility Notification',
    'f3': 'F3 Community Stillbirth Review',
    'f4': 'F4 Facility Maternal Death Review',
    'f5': 'F5 Facility Neonatal Death Review',
    'f6': 'F6 Facility Stillbirth Review',
    'va_md': 'Community Verbal Autopsy (Maternal)',
    'sa_md': 'Social Autopsy (Maternal)',
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

        # MPDSR is CIPRB-owned — default partner to CIPRB if the submission
        # didn't carry one (the webhook now sets it, this is belt-and-braces).
        partner = submission.partner or 'CIPRB'

        # submitted_at is normally a datetime; guard against a date/str.
        submitted = submission.submitted_at
        if hasattr(submitted, 'date'):
            date_of_death = submitted.date()
        else:
            date_of_death = submitted or timezone.now().date()

        # Compute logic-error flags (Animesh QA gate, deck slide 9). Advisory
        # only — flagged rows still flow through the normal review status.
        from .validators import compute_logic_flags
        logic_flags = compute_logic_flags(
            death_type=death_type,
            age_years=age_years,
            cause_of_death=cause,
            date_of_death=date_of_death,
        )

        obj, created = self.get_or_create(
            submission=submission,
            defaults={
                'partner': partner,
                'district': district,
                'region': submission.region,
                'upazila': upazila,
                'union': union,
                'latitude': submission.latitude,
                'longitude': submission.longitude,
                'date_of_death': date_of_death,
                'sub_form_type': sub,
                'death_type': death_type,
                'cause_of_death': cause,
                'place_of_death': place_of_death,
                'facility_name': facility_name,
                'age_years': age_years,
                'status': ReviewStatus.REPORTED,
                'audit_trail': [],
                'logic_flags': logic_flags,
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

    # ── CIPRB dashboard "major indicators" (MPDSR Form 01 community +
    #    Form 04 facility). 9 of the 11 indicators were previously lost —
    #    captured by Kobo but never persisted to a queryable column.
    #    All nullable/blank → non-destructive migration. CharFields keep
    #    the raw choice slug; histograms bucket the integers downstream.
    time_of_death = models.CharField(max_length=20, blank=True, db_index=True)         # antepartum/intrapartum/postpartum_42d/unknown
    gestational_weeks = models.PositiveSmallIntegerField(null=True, blank=True)
    anc_visits_count = models.CharField(max_length=10, blank=True)                     # none/1/2/3/4_plus/unknown
    pnc_received = models.CharField(max_length=10, blank=True)                         # yes/no/unknown (3-state — keep as char)
    mode_of_delivery = models.CharField(max_length=20, blank=True, db_index=True)      # nvd/csection/assisted_vaginal/undelivered
    delivery_outcome = models.CharField(max_length=20, blank=True)                     # livebirth/stillbirth/na
    place_of_delivery = models.CharField(max_length=20, blank=True)                    # home/gov_facility/private_facility/in_transit/na
    person_assisted_delivery = models.CharField(max_length=20, blank=True)            # doctor/nurse/midwife/tba/relatives/self/none
    time_death_after_birth_hours = models.PositiveSmallIntegerField(null=True, blank=True)

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

    # Logic-error flag tags raised at MPDSRCase creation by the QA validator
    # (mpdsr.validators.compute_logic_flags). Each entry is a short stable
    # string like 'AGE_LOW'. Advisory only — the manager queue renders an
    # amber badge but the approval workflow is unchanged.
    logic_flags = models.JSONField(default=list, blank=True)

    # Provenance: 'kobo' = live submission via KoboToolbox webhook.
    # 'excel_va_2026' / 'excel_va_2025' / etc. = historical baseline ingested
    # from Sayeed's verbal-autopsy Excel files. Dashboards default to combined
    # view; filterable by source for forensics.
    source = models.CharField(max_length=40, default='kobo', db_index=True)

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

    # MPDSR is CIPRB-owned surveillance. The partner is normally 'CIPRB';
    # the map keeps a sensible prefix if a legacy PHD/Bandhu row ever exists.
    _PREFIX = {'PHD': 'PHD', 'Bandhu': 'BON', 'CIPRB': 'CIP'}

    def save(self, *args, **kwargs):
        if not self.case_hash:
            year = self.date_of_death.year if self.date_of_death else timezone.now().year
            prefix = self._PREFIX.get(self.partner, 'CIP')
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


# ─── Aggregate/lookup models ingested from Sayeed's Excel files ──────────────


class MPDSRDistrictDenominator(models.Model):
    """Per-district 'Project Deaths 2026' estimate — the denominator Animesh
    needs for the reporting % rate calculation (reported / estimated).

    Source: MPDSR Report_2026.xlsx :: District Wise sheet.
    """
    district = models.CharField(max_length=100, unique=True, db_index=True)
    # Project Deaths 2026 columns (estimates / projections)
    project_deaths_md = models.FloatField(null=True, blank=True, help_text='Estimated maternal deaths 2026')
    project_deaths_nd = models.FloatField(null=True, blank=True, help_text='Estimated neonatal deaths 2026')
    project_deaths_sb = models.FloatField(null=True, blank=True, help_text='Estimated stillbirths 2026')
    source = models.CharField(max_length=40, default='excel_2026', db_index=True)
    imported_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'MPDSR District Denominator'
        verbose_name_plural = 'MPDSR District Denominators'
        ordering = ['district']

    def __str__(self):
        return f'{self.district}: MD={self.project_deaths_md}'


class MPDSRFacilityCount(models.Model):
    """Per-facility FDN (Facility Death Notification) + FDR (Facility Death
    Review) counts. Feeds the Notification vs Review chart with real numbers
    instead of just live-Kobo submissions.

    Source: MPDSR Report_2026.xlsx :: FDN & FDR sheet.
    """
    district = models.CharField(max_length=100, db_index=True)
    facility_name = models.CharField(max_length=200, db_index=True)
    period = models.CharField(max_length=20, default='2026', db_index=True,
                              help_text='Reporting period, e.g. "2026" or "2026-Q1"')

    # CDN = Community Death Notification (per MPDSR Report 2026 columns:
    # CDN / VA / SA / FDN / FDR per death type). Animesh's spec wants
    # notifications "visibly separated by Community level and Facility level"
    # — CDN is the community level, FDN is the facility level.
    cdn_md = models.PositiveIntegerField(default=0)
    cdn_nd = models.PositiveIntegerField(default=0)
    cdn_sb = models.PositiveIntegerField(default=0)

    fdn_md = models.PositiveIntegerField(default=0)
    fdn_nd = models.PositiveIntegerField(default=0)
    fdn_sb = models.PositiveIntegerField(default=0)
    fdr_md = models.PositiveIntegerField(default=0)
    fdr_nd = models.PositiveIntegerField(default=0)
    fdr_sb = models.PositiveIntegerField(default=0)

    source = models.CharField(max_length=40, default='excel_2026', db_index=True)
    imported_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'MPDSR Facility Count'
        verbose_name_plural = 'MPDSR Facility Counts'
        unique_together = [('district', 'facility_name', 'period')]
        ordering = ['district', 'facility_name']

    def __str__(self):
        return f'{self.district} / {self.facility_name} ({self.period})'


class MPDSRActionPlanSummary(models.Model):
    """Per-district response plan implementation tracker.

    Each row represents a planned MPDSR review/committee meeting and what
    activities were actually executed. Drives Animesh's 'MPDSR Response Plan
    Implementation Tracker' box (planned vs executed accountability).

    Source: MPDSR Action Plan_ Progress.xlsx :: per-district sheets.
    """
    REVIEW_DM = 'DM'     # District MPDSR
    REVIEW_UM = 'UM'     # Upazila MPDSR
    LEVEL_CHOICES = [(REVIEW_DM, 'District'), (REVIEW_UM, 'Upazila')]

    district = models.CharField(max_length=100, db_index=True)
    level = models.CharField(max_length=4, choices=LEVEL_CHOICES, db_index=True)
    place_of_meeting = models.CharField(max_length=200, blank=True)
    meeting_date = models.CharField(max_length=40, blank=True,
                                    help_text='Raw Excel date string — kept as text for messy formats')
    participants = models.PositiveIntegerField(null=True, blank=True)

    meetings_planned = models.PositiveIntegerField(default=0,
                                                   help_text='Number of follow-up meetings planned')
    activities_planned = models.PositiveIntegerField(default=0)
    activities_implemented = models.PositiveIntegerField(default=0)

    # Per-action detail for the full accountability matrix (Animesh's spec:
    # Date / Action / Timeline / Responsible / Indicator / Milestone /
    # Remarks / Implementation Status). List of dicts, one per action.
    # Drives the expandable matrix + deadline-based green/red colouring.
    actions = models.JSONField(default=list, blank=True)

    source = models.CharField(max_length=40, default='excel_action_plan_2026', db_index=True)
    imported_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'MPDSR Action Plan Summary'
        verbose_name_plural = 'MPDSR Action Plan Summaries'
        ordering = ['district', 'level']

    def __str__(self):
        return f'{self.district} [{self.level}]: {self.activities_implemented}/{self.activities_planned}'

    @property
    def completion_pct(self) -> float:
        if not self.activities_planned:
            return 0.0
        return round(100.0 * self.activities_implemented / self.activities_planned, 1)


# ── CIPRB Phase 2 models (notification slips + Maternal Near Miss).
from .ciprb_models import (  # noqa: F401,E402
    MPDSRDeathNotification,
    MaternalNearMissCase,
)
