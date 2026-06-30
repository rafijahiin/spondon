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

    Audit FIX 7.6 — Outreach Movement Register fields added (out_time,
    return_time, purpose, manager_endorsement). Manager endorsement acts
    as a soft approval gate: rows with manager_endorsement=False stay in
    SubmissionBase PENDING and are not counted toward the indicator until
    the manager flips the flag.
    """

    # Audit FIX 12.3 (Commit 3 also touches this — variant flag) — fixed-site
    # vs mobile camp. Bandhu 1.9 indicator counts mobile-camp variants only.
    FIXED_SITE  = 'fixed_site'
    MOBILE_CAMP = 'mobile_camp'
    SESSION_VARIANT_CHOICES = [
        (FIXED_SITE,  'Fixed Site'),
        (MOBILE_CAMP, 'Mobile Camp'),
    ]

    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='outreach_sessions'
    )

    session_date = models.DateField(db_index=True)
    peer_educator_name = models.CharField(max_length=200)
    spot_name = models.CharField(max_length=200, blank=True)

    # ─── Audit FIX 7.6 — Outreach Movement Register fields ─────────────────
    out_time = models.TimeField(null=True, blank=True)
    return_time = models.TimeField(null=True, blank=True)
    purpose = models.TextField(blank=True)
    # Manager endorsement gate. False = stays unapproved; manager flips
    # to True when accepting the outreach record.
    manager_endorsement = models.BooleanField(default=False)

    # Audit FIX 12.3 — fixed-site vs mobile-camp variant.
    session_variant = models.CharField(
        max_length=20, choices=SESSION_VARIANT_CHOICES, default=FIXED_SITE,
        db_index=True,
    )

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


class WellnessLogbookEntry(SubmissionBase):
    """F-01 Wellness Centre Service Logbook — a REVIEWABLE retention record.

    The F-01 logbook is the centre's own day-book of services. Those services
    are *counted* via the Patient Record (F-05) and HTC (F-06) tools, so this
    model is deliberately NOT read by any indicator — keeping it out of the
    numbers avoids double-counting. It exists so every F-01 submission lands in
    the approval queue and is preserved in SIMPLE, not only in KoboToolbox. The
    full submission is kept in raw_payload for the reviewer (audit H1)."""
    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT,
        related_name='wellness_logbook_entries',
    )
    service_date = models.DateField(null=True, blank=True, db_index=True)
    client_id = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ['-service_date']
        verbose_name = 'Wellness logbook entry'
        verbose_name_plural = 'Wellness logbook entries'

    def __str__(self):
        return f'F-01 logbook {self.service_date} — {self.client_id}'
