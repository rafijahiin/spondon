"""
Counselling and mental health models:
  - HTCCounselling         (HIV Testing & Counselling — KF-04)
  - IndividualCounselling  (Daily Counselling Session — KF-09)
  - MHScreening            (Depression / PTSD screening — KF-05/06)
"""
from django.db import models
from .._base_choices import ORG_CHOICES
from ._base import SubmissionBase


class HTCCounselling(SubmissionBase):
    PRE = 'pre'
    POST = 'post'
    ONGOING = 'ongoing'
    SESSION_TYPE_CHOICES = [
        (PRE, 'Pre-Test'),
        (POST, 'Post-Test'),
        (ONGOING, 'Ongoing'),
    ]

    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='htc_sessions'
    )
    client = models.ForeignKey(
        'programs.Client', on_delete=models.PROTECT, related_name='htc_sessions'
    )

    session_type = models.CharField(max_length=20, choices=SESSION_TYPE_CHOICES)
    session_date = models.DateField(db_index=True)
    age_at_session = models.PositiveSmallIntegerField(null=True, blank=True)

    # Risk assessment
    partner_count = models.CharField(max_length=20, blank=True)
    condom_use = models.CharField(max_length=20, blank=True)
    needle_sharing = models.BooleanField(null=True)
    blood_transfusion = models.BooleanField(null=True)
    partner_hiv_positive = models.CharField(max_length=20, blank=True)
    client_pregnant = models.BooleanField(null=True)
    pregnancy_trimester = models.CharField(max_length=20, blank=True)

    # Counsellor checklist
    covered_hiv_sti_prevention = models.BooleanField(default=False)
    covered_risk_assessment = models.BooleanField(default=False)
    covered_behavior_change = models.BooleanField(default=False)
    covered_support_systems = models.BooleanField(default=False)
    client_consented = models.BooleanField(default=False)

    counsellor_name = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-session_date']

    def __str__(self):
        return f'HTC {self.session_type} — {self.session_date}'


class IndividualCounselling(SubmissionBase):
    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='counselling_sessions'
    )
    client = models.ForeignKey(
        'programs.Client', on_delete=models.PROTECT, related_name='counselling_sessions'
    )

    session_date = models.DateField(db_index=True)
    counsellor_name = models.CharField(max_length=200, blank=True)

    # Issues (multi-select mapped to booleans)
    issue_sti = models.BooleanField(default=False)
    issue_general_health = models.BooleanField(default=False)
    issue_fp = models.BooleanField(default=False)
    issue_drug_use = models.BooleanField(default=False)
    issue_psychosocial = models.BooleanField(default=False)  # counts for MHPSS indicator
    issue_gbv = models.BooleanField(default=False)
    issue_other = models.BooleanField(default=False)

    condom_distributed = models.PositiveSmallIntegerField(default=0)
    iec_materials = models.PositiveSmallIntegerField(default=0)

    # Referrals from this session
    referral_mental_health = models.BooleanField(default=False)
    referral_legal = models.BooleanField(default=False)
    referral_htc = models.BooleanField(default=False)
    referral_gbv = models.BooleanField(default=False)

    drug_habit_noted = models.BooleanField(default=False)
    drug_names = models.CharField(max_length=300, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-session_date']

    def __str__(self):
        return f'Counselling {self.session_date}'


class MHScreening(SubmissionBase):
    DEPRESSION = 'depression'
    PTSD = 'ptsd'
    SCREENING_TYPE_CHOICES = [
        (DEPRESSION, 'Depression (Zahiruddin Scale)'),
        (PTSD, 'PTSD'),
    ]

    # Severity bands — used for dashboard charts
    NONE = 'none'
    MILD = 'mild'
    MODERATE = 'moderate'
    SEVERE = 'severe'
    EXTREME = 'extreme'
    PROFOUND = 'profound'
    SEVERITY_CHOICES = [
        (NONE, 'No / Minimal'),
        (MILD, 'Mild'),
        (MODERATE, 'Moderate'),
        (SEVERE, 'Severe'),
        (EXTREME, 'Extreme'),
        (PROFOUND, 'Profound'),
    ]

    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='mh_screenings'
    )
    client = models.ForeignKey(
        'programs.Client', on_delete=models.PROTECT, related_name='mh_screenings'
    )

    screening_type = models.CharField(max_length=20, choices=SCREENING_TYPE_CHOICES)
    screening_date = models.DateField(db_index=True)
    psycho_number = models.CharField(max_length=50, blank=True)
    counsellor_name = models.CharField(max_length=200, blank=True)

    total_score = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    severity_category = models.CharField(
        max_length=20, choices=SEVERITY_CHOICES, blank=True
    )

    # Depression: 30 items (1-5 scale) stored as JSON for flexibility
    item_responses = models.JSONField(default=dict, blank=True)

    referred_for_counselling = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-screening_date']

    def __str__(self):
        return f'{self.get_screening_type_display()} screening {self.screening_date}'
