"""
Outreach and community education models:
  - OutreachSession       (Daily Outreach — KF-08)
  - GroupEducationSession (Group Education — KF-10)
"""
from django.db import models
from .._base_choices import ORG_CHOICES
from ._base import SubmissionBase


class OutreachSession(SubmissionBase):
    """
    Daily outreach session submitted by CO / Peer Educator.
    individual_contacts feeds directly into indicator I_BND_1_4B / I_PHD_1_4.
    """
    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='outreach_sessions'
    )

    session_date = models.DateField(db_index=True)
    peer_educator_name = models.CharField(max_length=200)
    spot_name = models.CharField(max_length=200, blank=True)

    individual_contacts = models.PositiveIntegerField(default=0)
    individual_health_edu_count = models.PositiveIntegerField(default=0)
    group_health_edu_count = models.PositiveIntegerField(default=0)
    condoms_distributed_free = models.PositiveIntegerField(default=0)
    lubricants_distributed_free = models.PositiveIntegerField(default=0)
    iec_bcc_materials_distributed = models.PositiveIntegerField(default=0)

    # Session type counts
    hiv_aids_sti_knowledge_sessions = models.PositiveSmallIntegerField(default=0)
    gbv_sessions = models.PositiveSmallIntegerField(default=0)

    # Referrals made during outreach
    referral_mental_health = models.PositiveSmallIntegerField(default=0)
    referral_legal_services = models.PositiveSmallIntegerField(default=0)
    referral_htc_hts = models.PositiveSmallIntegerField(default=0)
    referral_gbv = models.PositiveSmallIntegerField(default=0)
    referral_other = models.PositiveSmallIntegerField(default=0)

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-session_date']

    def __str__(self):
        return f'Outreach {self.session_date} — {self.peer_educator_name}'


class GroupEducationSession(SubmissionBase):
    """
    Group education / health awareness session.
    participant_count feeds into I_BND_1_4B (KP reached).
    session count feeds into I_BND_1_4A / I_PHD_1_4.
    """
    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='group_edu_sessions'
    )

    session_date = models.DateField(db_index=True)
    spot_name = models.CharField(max_length=200, blank=True)
    facilitator_name = models.CharField(max_length=200, blank=True)
    topic = models.CharField(max_length=300)

    participant_count = models.PositiveIntegerField(default=0)
    male_count = models.PositiveIntegerField(default=0)
    female_count = models.PositiveIntegerField(default=0)
    tg_count = models.PositiveIntegerField(default=0)

    duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    materials_distributed = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-session_date']

    def __str__(self):
        return f'Group Ed {self.session_date} — {self.topic[:40]}'
