"""
Clinical service models:
  - ClinicVisit        (Patient Record Register — KF-02)
  - HIVSTITestResult   (HIV/STI Test Result — KF-03)
  - ADRRecord          (Adverse Drug Reaction — KF-13)
  - AutoclaveLog       (Autoclave / Incinerator Log — KF-16)
  - AntenatalCard      (PHD only — ANC visits)
"""
from django.db import models
from .._base_choices import ORG_CHOICES
from ._base import SubmissionBase


class ClinicVisit(SubmissionBase):
    NEW = 'new'
    FOLLOW_UP = 'follow_up'
    RECURRENT = 'recurrent'
    VISIT_TYPE_CHOICES = [
        (NEW, 'New'),
        (FOLLOW_UP, 'Follow-Up'),
        (RECURRENT, 'Recurrent'),
    ]

    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='clinic_visits'
    )
    client = models.ForeignKey(
        'programs.Client', on_delete=models.PROTECT, related_name='clinic_visits'
    )

    visit_date = models.DateField(db_index=True)
    visit_type = models.CharField(max_length=20, choices=VISIT_TYPE_CHOICES, default=NEW)
    monthly_serial = models.CharField(max_length=20, blank=True)

    # Screenings (yes/no booleans)
    sti_screening_done = models.BooleanField(default=False)
    hiv_screening_done = models.BooleanField(default=False)
    tb_screening_done = models.BooleanField(default=False)
    diabetic_screening_done = models.BooleanField(default=False)
    hep_b_screening_done = models.BooleanField(default=False)   # PHD only
    hep_c_screening_done = models.BooleanField(default=False)   # PHD only

    # STI Diagnoses
    diag_uds = models.BooleanField(default=False)
    diag_vds = models.BooleanField(default=False)
    diag_gu = models.BooleanField(default=False)
    diag_pid = models.BooleanField(default=False)
    diag_ss = models.BooleanField(default=False)
    diag_ib = models.BooleanField(default=False)
    diag_anal_sti = models.BooleanField(default=False)
    diag_other = models.BooleanField(default=False)
    diag_other_specify = models.CharField(max_length=200, blank=True)
    diag_gh = models.BooleanField(default=False)        # General Health
    diag_psd = models.BooleanField(default=False)       # Psychosexual Disorder
    diag_mental_health = models.BooleanField(default=False)

    treatment_provided = models.TextField(blank=True)
    seeking_treatment_timing = models.CharField(max_length=20, blank=True)
    condom_demo_sessions = models.PositiveSmallIntegerField(default=0)
    condoms_distributed = models.PositiveIntegerField(default=0)
    sti_counselling_provided = models.BooleanField(default=False)
    partner_management = models.CharField(max_length=50, blank=True)

    # Referrals from this visit
    referral_tb = models.BooleanField(default=False)
    referral_sti_kp = models.BooleanField(default=False)
    referral_sti_partner = models.BooleanField(default=False)
    referral_general_health = models.BooleanField(default=False)
    referral_hiv_testing = models.BooleanField(default=False)
    referral_mental_health = models.BooleanField(default=False)
    referral_diabetic = models.BooleanField(default=False)
    referral_fp = models.BooleanField(default=False)

    follow_up_due_date = models.DateField(null=True, blank=True)
    follow_up_done_date = models.DateField(null=True, blank=True)
    adr_monitoring = models.BooleanField(default=False)
    prepared_by = models.CharField(max_length=200, blank=True)

    # PHD-specific
    pregnancy_status = models.CharField(max_length=50, blank=True)
    anc_status = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ['-visit_date']

    def __str__(self):
        return f'Visit {self.visit_date} — {self.client_id if hasattr(self, "client_id") else ""}'


class HIVSTITestResult(SubmissionBase):
    POSITIVE = 'positive'
    NEGATIVE = 'negative'
    INDETERMINATE = 'indeterminate'
    NOT_DONE = 'not_done'
    RESULT_CHOICES = [
        (POSITIVE, 'Positive'),
        (NEGATIVE, 'Negative'),
        (INDETERMINATE, 'Indeterminate'),
        (NOT_DONE, 'Not Done'),
    ]

    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='hiv_sti_tests'
    )
    client = models.ForeignKey(
        'programs.Client', on_delete=models.PROTECT, related_name='hiv_sti_tests'
    )
    clinic_visit = models.ForeignKey(
        ClinicVisit, null=True, blank=True, on_delete=models.SET_NULL, related_name='test_results'
    )

    testing_date = models.DateField(db_index=True)
    lab_id = models.CharField(max_length=100, blank=True)

    hiv_result = models.CharField(max_length=20, choices=RESULT_CHOICES, default=NOT_DONE)
    syphilis_result = models.CharField(max_length=20, choices=RESULT_CHOICES, default=NOT_DONE)
    hep_b_result = models.CharField(max_length=20, choices=RESULT_CHOICES, default=NOT_DONE)
    hep_c_result = models.CharField(max_length=20, choices=RESULT_CHOICES, default=NOT_DONE)

    in_window_period = models.BooleanField(default=False)
    retest_date = models.DateField(null=True, blank=True)
    art_linkage_status = models.CharField(max_length=200, blank=True)
    counsellor_name = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-testing_date']

    def __str__(self):
        return f'HIV/STI Test {self.testing_date}'


class ADRRecord(SubmissionBase):
    """Adverse Drug Reaction report — triggers Telegram alert on approval."""
    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='adr_records'
    )
    client = models.ForeignKey(
        'programs.Client', on_delete=models.PROTECT, related_name='adr_records'
    )

    report_date = models.DateField()
    drugs_given = models.TextField(blank=True)
    followup_date = models.DateField(null=True, blank=True)
    adverse_effect_present = models.BooleanField(default=False)
    adverse_effect_description = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-report_date']


class AutoclaveLog(SubmissionBase):
    AUTOCLAVE = 'autoclave'
    INCINERATOR = 'incinerator'
    LOG_TYPE_CHOICES = [(AUTOCLAVE, 'Autoclave'), (INCINERATOR, 'Incinerator')]

    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='autoclave_logs'
    )

    log_date = models.DateField()
    log_type = models.CharField(max_length=20, choices=LOG_TYPE_CHOICES)

    # Autoclave fields
    items_autoclaved = models.TextField(blank=True)
    temp_121_achieved = models.BooleanField(null=True)
    tape_test_passed = models.BooleanField(null=True)
    done_by = models.CharField(max_length=200, blank=True)

    # Incinerator fields
    material_type = models.CharField(max_length=200, blank=True)
    quantity = models.CharField(max_length=100, blank=True)
    supervised_by = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-log_date']


class AntenatalCard(SubmissionBase):
    """PHD only — Antenatal Care (ANC) visit record."""
    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.PROTECT, related_name='antenatal_cards'
    )
    client = models.ForeignKey(
        'programs.Client', on_delete=models.PROTECT, related_name='antenatal_cards'
    )

    visit_date = models.DateField(db_index=True)
    anc_visit_number = models.PositiveSmallIntegerField(default=1)
    trimester = models.CharField(max_length=20, blank=True)
    lmp_date = models.DateField(null=True, blank=True)
    edd = models.DateField(null=True, blank=True)
    blood_pressure = models.CharField(max_length=20, blank=True)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    referred = models.BooleanField(default=False)
    referred_to = models.CharField(max_length=200, blank=True)
    prepared_by = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-visit_date']
