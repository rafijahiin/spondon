"""
Programme operations models:
  - TrainingEvent       (Training / Orientation / Workshop — KF-20)
  - CoordMeeting        (Coordination Meeting — KF-19)
  - MobileHealthCamp    (PHD only — KF-18)
  - VisitorRegister     (KF-21)
"""
import uuid
from django.db import models
from .._base_choices import ORG_CHOICES
from ._base import TimestampedModel, SubmissionBase


class TrainingEvent(SubmissionBase):
    """
    Training / orientation / workshop event.
    total_participants feeds indicators:
      Bandhu: 2.1 (health managers), 2.2 (midwives), 2.5 (PEs)
      PHD: 2.1 (managers), 2.2 (MAs/midwives), 2.3 (PEs)
    """
    ORIENTATION = 'orientation'
    TRAINING = 'training'
    WORKSHOP = 'workshop'
    EVENT_TYPE_CHOICES = [
        (ORIENTATION, 'Orientation'),
        (TRAINING, 'Training'),
        (WORKSHOP, 'Workshop'),
    ]

    HM = 'HM'       # Health Managers
    MW = 'MW'       # Midwives / Medical Assistants
    PE = 'PE'       # Peer Educators
    CL = 'CL'       # Community Leaders
    GOB = 'GOB'     # Government Officials
    MIXED = 'MIXED'
    PARTICIPANT_TYPE_CHOICES = [
        (HM, 'Health Managers (UHC/DGHS/DGFP)'),
        (MW, 'Midwives / Medical Assistants'),
        (PE, 'Peer Educators'),
        (CL, 'Community Leaders'),
        (GOB, 'District / Upazila GOB Staff'),
        (MIXED, 'Mixed'),
    ]

    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='training_events'
    )

    event_date = models.DateField(db_index=True)
    event_end_date = models.DateField(null=True, blank=True)
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES)
    participant_type = models.CharField(max_length=10, choices=PARTICIPANT_TYPE_CHOICES)
    topic = models.CharField(max_length=300)
    location_text = models.CharField(max_length=300, blank=True)
    district = models.CharField(max_length=100, blank=True)

    total_participants = models.PositiveIntegerField(default=0)
    male_participants = models.PositiveIntegerField(default=0)
    female_participants = models.PositiveIntegerField(default=0)
    tg_participants = models.PositiveIntegerField(default=0)

    facilitator = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-event_date']

    def __str__(self):
        return f'{self.event_type} — {self.topic[:40]} ({self.event_date})'


class CoordMeeting(SubmissionBase):
    """
    Coordination meeting report.
    feeds indicators: Bandhu 2.3 (GOB), 2.4 (CBO); PHD 2.4
    """
    GOB = 'GOB'
    CBO = 'CBO'
    INTERNAL = 'internal'
    MULTI = 'multi'
    MEETING_TYPE_CHOICES = [
        (GOB, 'GOB / Health Staff'),
        (CBO, 'CBO / Community Network'),
        (INTERNAL, 'Internal'),
        (MULTI, 'Multi-Stakeholder'),
    ]

    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='coord_meetings'
    )

    meeting_date = models.DateField(db_index=True)
    meeting_type = models.CharField(max_length=20, choices=MEETING_TYPE_CHOICES, db_index=True)
    location_text = models.CharField(max_length=300, blank=True)
    district = models.CharField(max_length=100, blank=True)
    participant_count = models.PositiveIntegerField(default=0)
    agenda = models.TextField(blank=True)
    key_decisions = models.TextField(blank=True)
    prepared_by = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-meeting_date']

    def __str__(self):
        return f'{self.meeting_type} meeting — {self.meeting_date}'


class MobileHealthCamp(SubmissionBase):
    """
    PHD only — mobile health camp at brothel.
    camp count feeds indicator I_PHD_1_8 (target: 40 camps).
    """
    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='mobile_health_camps'
    )

    camp_date = models.DateField(db_index=True)
    location_text = models.CharField(max_length=300, blank=True)
    brothel_name = models.CharField(max_length=200, blank=True)

    clients_served = models.PositiveIntegerField(default=0)
    hiv_tests_done = models.PositiveIntegerField(default=0)
    sti_screenings_done = models.PositiveIntegerField(default=0)
    counselling_sessions = models.PositiveIntegerField(default=0)
    referrals_made = models.PositiveIntegerField(default=0)
    condoms_distributed = models.PositiveIntegerField(default=0)

    services_description = models.TextField(blank=True)
    team_members = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-camp_date']

    def __str__(self):
        return f'Mobile Camp {self.camp_date} — {self.brothel_name or self.center}'


class VisitorRegister(TimestampedModel):
    """External visitor register (browser-based)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='visitor_entries'
    )

    visit_date = models.DateField()
    visitor_name = models.CharField(max_length=200)
    designation_and_address = models.CharField(max_length=300, blank=True)
    purpose_of_visit = models.TextField(blank=True)
    iec_bcc_distributed = models.BooleanField(default=False)
    visitor_comments = models.TextField(blank=True)
    prepared_by = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['-visit_date']
