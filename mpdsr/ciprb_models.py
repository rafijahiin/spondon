"""
CIPRB-specific MPDSR-side models that complement the existing MPDSRCase:

  - MPDSRDeathNotification    — death-notification slips 01 + 02
  - MaternalNearMissCase      — WHO MNM audit submissions

The existing MPDSRCase is reused for the 4 review forms (Form 1, 2, 4, 5)
+ Social Autopsy, distinguished by `sub_form_type`. No schema change
needed there. These two new models cover the workflows MPDSRCase doesn't.
"""
import uuid
from django.db import models


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   MPDSRDeathNotification — Slip 01 and Slip 02                          ║
# ╚══════════════════════════════════════════════════════════════════════════╝

class MPDSRDeathNotification(models.Model):
    """Two slips notify the same kind of event (a death) from the field,
    and trigger review committee work downstream.  They share schema."""

    KIND_MATERNAL   = 'maternal'
    KIND_NEONATAL   = 'neonatal'
    KIND_STILLBIRTH = 'stillbirth'
    KIND_CHOICES = [
        (KIND_MATERNAL,   'Maternal death'),
        (KIND_NEONATAL,   'Neonatal death'),
        (KIND_STILLBIRTH, 'Stillbirth'),
    ]

    SLIP_01 = '01'
    SLIP_02 = '02'
    SLIP_CHOICES = [(SLIP_01, 'Slip 01'), (SLIP_02, 'Slip 02')]

    PLACE_HOME       = 'home'
    PLACE_FACILITY   = 'facility'
    PLACE_TRANSIT    = 'in_transit'
    PLACE_CHOICES = [
        (PLACE_HOME,     'Home'),
        (PLACE_FACILITY, 'Health facility'),
        (PLACE_TRANSIT,  'In transit'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_serial = models.CharField(max_length=50, blank=True, db_index=True)

    submission = models.OneToOneField(
        'submissions.KoboSubmission',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='mpdsr_notification',
    )
    organisation = models.CharField(max_length=20, default='CIPRB',
                                    db_index=True)
    slip_variant = models.CharField(max_length=2, choices=SLIP_CHOICES,
                                    default=SLIP_01, db_index=True)

    # Location.
    district = models.CharField(max_length=100, db_index=True)
    upazila  = models.CharField(max_length=100, blank=True)
    union    = models.CharField(max_length=100, blank=True)
    village  = models.CharField(max_length=100, blank=True)

    # Event.
    death_kind = models.CharField(max_length=20, choices=KIND_CHOICES,
                                  db_index=True)
    deceased_name = models.CharField(max_length=200)
    deceased_age  = models.PositiveSmallIntegerField(null=True, blank=True)
    deceased_address = models.CharField(max_length=300, blank=True)
    date_of_death = models.DateField(db_index=True)
    place_of_death = models.CharField(max_length=20, choices=PLACE_CHOICES,
                                      blank=True)
    cause_brief = models.CharField(max_length=300, blank=True)

    # Reporter.
    reporter_name   = models.CharField(max_length=200)
    reporter_role   = models.CharField(max_length=20, blank=True)
    reporter_mobile = models.CharField(max_length=30, blank=True)
    notification_date = models.DateField(null=True, blank=True)

    # Provenance.
    latitude  = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date_of_death', '-created_at']
        verbose_name = 'MPDSR Death Notification'
        verbose_name_plural = 'MPDSR Death Notifications'
        indexes = [
            models.Index(fields=['organisation', 'death_kind']),
            models.Index(fields=['district', 'date_of_death']),
        ]

    def __str__(self):
        return f'Notification {self.case_serial or str(self.id)[:8]} ({self.death_kind})'


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   MaternalNearMissCase — WHO MNM audit                                  ║
# ╚══════════════════════════════════════════════════════════════════════════╝

class MaternalNearMissCase(models.Model):
    """One MNM audit per case. Three sections of binary screening
    questions (severe complications, critical interventions,
    life-threatening conditions) plus the delivery context and an audit
    summary."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_serial = models.CharField(max_length=50, blank=True, db_index=True)

    submission = models.OneToOneField(
        'submissions.KoboSubmission',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='mnm_case',
    )
    organisation = models.CharField(max_length=20, default='CIPRB',
                                    db_index=True)

    # Location + woman.
    district = models.CharField(max_length=100, db_index=True)
    upazila  = models.CharField(max_length=100, blank=True)
    union    = models.CharField(max_length=100, blank=True)
    village  = models.CharField(max_length=100, blank=True)
    woman_name = models.CharField(max_length=200)
    woman_age  = models.PositiveSmallIntegerField(null=True, blank=True)
    gestational_weeks = models.PositiveSmallIntegerField(null=True, blank=True)
    facility_name = models.CharField(max_length=200, blank=True)
    event_date = models.DateField(db_index=True)

    # Section 1 — severe maternal complications (6 booleans).
    sev_pph       = models.BooleanField(default=False)
    sev_preec     = models.BooleanField(default=False)
    eclampsia     = models.BooleanField(default=False)
    sepsis        = models.BooleanField(default=False)
    rupt_uterus   = models.BooleanField(default=False)
    sev_abortion  = models.BooleanField(default=False)

    # Section 2 — critical interventions (4 booleans).
    crit_blood    = models.BooleanField(default=False)
    crit_radiol   = models.BooleanField(default=False)
    crit_laparot  = models.BooleanField(default=False)
    crit_icu      = models.BooleanField(default=False)

    # Section 3 — life-threatening conditions (7 booleans).
    life_cardio   = models.BooleanField(default=False)
    life_resp     = models.BooleanField(default=False)
    life_renal    = models.BooleanField(default=False)
    life_coag     = models.BooleanField(default=False)
    life_hepatic  = models.BooleanField(default=False)
    life_neuro    = models.BooleanField(default=False)
    life_uterine  = models.BooleanField(default=False)

    # Delivery + outcome.
    mode_of_delivery   = models.CharField(max_length=30, blank=True)
    delivery_outcome   = models.CharField(max_length=20, blank=True)
    cause_of_near_miss = models.CharField(max_length=50, blank=True,
                                          db_index=True)
    contributory_conditions = models.TextField(blank=True)
    audit_summary           = models.TextField(blank=True)

    # Provenance.
    latitude  = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    enumerator_name = models.CharField(max_length=200, blank=True)
    enumerator_mobile = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-event_date', '-created_at']
        verbose_name = 'Maternal Near Miss Case'
        verbose_name_plural = 'Maternal Near Miss Cases'
        indexes = [
            models.Index(fields=['organisation', 'event_date']),
            models.Index(fields=['district', 'event_date']),
        ]

    def __str__(self):
        return f'MNM {self.case_serial or str(self.id)[:8]} ({self.district})'

    @property
    def severe_complication_count(self) -> int:
        return sum([self.sev_pph, self.sev_preec, self.eclampsia,
                    self.sepsis, self.rupt_uterus, self.sev_abortion])

    @property
    def critical_intervention_count(self) -> int:
        return sum([self.crit_blood, self.crit_radiol,
                    self.crit_laparot, self.crit_icu])

    @property
    def life_threat_count(self) -> int:
        return sum([self.life_cardio, self.life_resp, self.life_renal,
                    self.life_coag, self.life_hepatic, self.life_neuro,
                    self.life_uterine])
