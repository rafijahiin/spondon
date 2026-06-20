"""
CIPRBFistulaCase — the new CIPRB Fistula Question Bank model.

Separate from the existing FistulaCornerCase (which stays unchanged for
the historical KF-Fistula data). One CIPRBFistulaCase row per woman;
fields cluster by the five clinical stages so the dashboard's pipeline
can count progressions directly.

A given submission may carry only the fields for ONE stage (the form's
`stage` selector). The handler upserts on (district + case_serial +
deceased_name) and writes only the fields under that stage — so the
same case row accumulates data as it moves through Suspected →
Diagnosed → Referred → Repaired → Rehabilitated.
"""
import uuid
from django.db import models
from django.conf import settings


class CIPRBFistulaCase(models.Model):
    # ── Stage choices (drive the dashboard pipeline counts).
    STAGE_SUSPECTED     = 'suspected'
    STAGE_DIAGNOSED     = 'diagnosed'
    STAGE_REFERRED      = 'referred'
    STAGE_REPAIRED      = 'repaired'
    STAGE_REHABILITATED = 'rehabilitated'
    STAGE_CHOICES = [
        (STAGE_SUSPECTED,     'Suspected'),
        (STAGE_DIAGNOSED,     'Diagnosed'),
        (STAGE_REFERRED,      'Referred for Surgical Management'),
        (STAGE_REPAIRED,      'Surgically Repaired'),
        (STAGE_REHABILITATED, 'Rehabilitated & Reintegrated'),
    ]

    # ── 4 fistula types per CIPRB Question Bank (the dashboard donut).
    TYPE_OBSTETRIC  = 'obstetric'
    TYPE_IATROGENIC = 'iatrogenic'
    TYPE_CONGENITAL = 'congenital'
    TYPE_TRAUMATIC  = 'traumatic'
    TYPE_CHOICES = [
        (TYPE_OBSTETRIC,  'Obstetric'),
        (TYPE_IATROGENIC, 'Iatrogenic'),
        (TYPE_CONGENITAL, 'Congenital'),
        (TYPE_TRAUMATIC,  'Traumatic'),
    ]

    # ── Surgery outcome.
    SURG_DRY      = 'success_dry'
    SURG_NOT_DRY  = 'success_not_dry'
    SURG_FAILED   = 'failed'
    SURGERY_OUTCOME_CHOICES = [
        (SURG_DRY,     'Successfully repaired with a dry vagina'),
        (SURG_NOT_DRY, 'Successfully repaired but not dry'),
        (SURG_FAILED,  'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_serial = models.CharField(
        max_length=50, blank=True, db_index=True,
        help_text='CIPRB annual fistula serial (from the paper form).',
    )
    # ── Stable, unique patient key — the registry ID typed at the Suspected
    #    stage (<district-code>-<4-digit serial>, e.g. 1-0001, 10-0001). Every
    #    later stage references this exact ID via the form's dropdown, so the
    #    case row accumulates against one key. null=True (not '') so legacy
    #    rows without a code don't collide on the unique constraint.
    patient_code = models.CharField(
        max_length=20, blank=True, null=True, unique=True, db_index=True,
        help_text='Unique fistula patient ID: <district-code>-<4-digit serial>.',
    )

    # ── Provenance.
    submission = models.OneToOneField(
        'submissions.KoboSubmission',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='ciprb_fistula_case',
    )
    organisation = models.CharField(max_length=20, default='CIPRB',
                                    db_index=True)
    district = models.CharField(max_length=100, db_index=True)
    upazila  = models.CharField(max_length=100, blank=True)
    union    = models.CharField(max_length=100, blank=True)
    village  = models.CharField(max_length=100, blank=True)

    # ── Patient identity.
    name                = models.CharField(max_length=200)
    age                 = models.PositiveSmallIntegerField(null=True, blank=True)
    education           = models.CharField(max_length=30, blank=True)
    husband             = models.CharField(max_length=200, blank=True)
    husband_profession  = models.CharField(max_length=200, blank=True)
    profession_patient  = models.CharField(max_length=200, blank=True)
    current_condition   = models.CharField(max_length=200, blank=True)
    contact_number      = models.CharField(max_length=30, blank=True)
    marital_status      = models.CharField(max_length=20, blank=True)
    age_at_marriage     = models.PositiveSmallIntegerField(null=True, blank=True)
    age_at_first_delivery = models.PositiveSmallIntegerField(null=True, blank=True)
    number_of_children  = models.PositiveSmallIntegerField(null=True, blank=True)

    # ── Obstetric history.
    delivery_complication       = models.CharField(max_length=200, blank=True)
    last_delivery_labour_duration = models.CharField(max_length=100, blank=True)
    mode_of_last_delivery       = models.CharField(max_length=30, blank=True)
    place_of_last_delivery      = models.CharField(max_length=30, blank=True)
    conducted_last_delivery     = models.CharField(max_length=30, blank=True)
    delivery_outcome            = models.CharField(max_length=20, blank=True)
    reasons_no_institutional_delivery = models.CharField(max_length=200, blank=True)
    time_duration_fistula_occurrence  = models.CharField(max_length=100, blank=True)
    duration_suffering          = models.CharField(max_length=100, blank=True)

    # ── Stage 1: Suspected.
    suspected_date     = models.DateField(null=True, blank=True)
    source_information = models.CharField(max_length=200, blank=True)
    # ── Stage 2: Diagnosed.
    diagnosed_date     = models.DateField(null=True, blank=True)
    diagnosed_place    = models.CharField(max_length=200, blank=True)
    diagnosed_by       = models.CharField(max_length=200, blank=True)
    # ── Stage 3: Referred for Surgical Management.
    refer_date          = models.DateField(null=True, blank=True)
    refer_place         = models.CharField(max_length=200, blank=True)
    referred_by_person  = models.CharField(max_length=200, blank=True)
    refer_outcome       = models.CharField(max_length=30, blank=True)
    # ── Stage 4: Surgically Repaired.
    operation_date       = models.DateField(null=True, blank=True)
    operation_place      = models.CharField(max_length=200, blank=True)
    hospital_stay_days   = models.PositiveSmallIntegerField(null=True, blank=True)
    times_of_operations  = models.PositiveSmallIntegerField(null=True, blank=True)
    fistula_type_v2      = models.CharField(
        max_length=20, choices=TYPE_CHOICES, blank=True, db_index=True,
        help_text='4-category fistula type per CIPRB Question Bank.',
    )
    iatrogenic_cause     = models.CharField(max_length=30, blank=True)
    genital_fistula_type = models.CharField(max_length=30, blank=True)
    operation_route      = models.CharField(max_length=30, blank=True)
    surgery_outcome_v2   = models.CharField(
        max_length=30, choices=SURGERY_OUTCOME_CHOICES, blank=True,
    )
    # ── Stage 5: Rehabilitated & Reintegrated.
    rehabilitation_received = models.BooleanField(null=True)
    rehabilitation_date     = models.DateField(null=True, blank=True)
    rehab_place             = models.CharField(max_length=50, blank=True)
    rehab_support_types     = models.CharField(max_length=500, blank=True)
    rehab_notes             = models.TextField(blank=True)

    # ── Current stage (latest stage the form has advanced this case to).
    current_stage = models.CharField(
        max_length=20, choices=STAGE_CHOICES, default=STAGE_SUSPECTED,
        db_index=True,
    )

    # ── Provenance / audit.
    latitude  = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    enumerator_name = models.CharField(max_length=200, blank=True)
    enumerator_mobile = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ── Manager approval (Tanjina / Setu, single-stage). Default APPROVED so
    #    existing/historical cases stay visible the moment the column lands; the
    #    webhook handler sets a NEW registration to PENDING. Once approved, later-
    #    stage updates keep the status (a case is not re-pended as it progresses).
    APPROVAL_CHOICES = [('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')]
    approval_status = models.CharField(
        max_length=20, choices=APPROVAL_CHOICES, default='APPROVED', db_index=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+')
    approved_at = models.DateTimeField(null=True, blank=True)
    kobo_submission_id = models.CharField(max_length=100, blank=True, default='')
    submitted_by_kobo_user = models.CharField(max_length=100, blank=True, default='')
    rejected_reason = models.TextField(blank=True, default='')
    # Queue-infrastructure parity only: the shared approval queue unconditionally
    # select_related's 'center'. Fistula is district-based (no ServiceCenter), so
    # this stays NULL and the queue renders '–' — but the column must EXIST or the
    # join raises FieldError and 500s the whole queue.
    center = models.ForeignKey(
        'programs.ServiceCenter', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+')

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'CIPRB Fistula Case'
        verbose_name_plural = 'CIPRB Fistula Cases'
        indexes = [
            models.Index(fields=['organisation', 'current_stage']),
            models.Index(fields=['district', 'current_stage']),
            models.Index(fields=['district', 'case_serial']),
        ]

    def __str__(self):
        s = self.case_serial or str(self.id)[:8]
        return f'CIPRB Fistula {s} — {self.name} ({self.current_stage})'
