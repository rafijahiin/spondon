import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def _safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


class FistulaCampaignManager(models.Manager):
    def get_or_create_from_submission(self, submission):
        raw = submission.raw_data

        obj, created = self.get_or_create(
            submission=submission,
            defaults={
                'partner': submission.partner,
                'district': raw.get('district') or submission.district,
                'upazila': raw.get('upazila') or '',
                'union': raw.get('union') or '',
                'village': raw.get('village') or '',
                'facility_name': raw.get('facility_name') or '',
                'region': submission.region,
                'latitude': submission.latitude,
                'longitude': submission.longitude,
                'campaign_date': submission.submitted_at.date(),
                # Reach
                'women_screened': _safe_int(raw.get('women_screened')),
                'women_reached_awareness': _safe_int(raw.get('women_reached_awareness')),
                'men_reached_awareness': _safe_int(raw.get('men_reached_awareness')),
                'community_sessions': _safe_int(raw.get('community_sessions')),
                # Cases
                'suspected_fistula_cases': _safe_int(raw.get('suspected_fistula_cases')),
                'confirmed_fistula_cases': _safe_int(raw.get('confirmed_fistula_cases')),
                'new_cases': _safe_int(raw.get('new_cases')),
                'repeat_cases': _safe_int(raw.get('repeat_cases')),
                'fistula_type': raw.get('fistula_type') or '',
                'fistula_cause': raw.get('fistula_cause') or '',
                # Referral
                'cases_referred': _safe_int(raw.get('cases_referred')),
                'cases_accepted_referral': _safe_int(raw.get('cases_accepted_referral')),
                'cases_reached_facility': _safe_int(raw.get('cases_reached_facility')),
                # Surgery
                'cases_surgery_completed': _safe_int(raw.get('cases_surgery_completed')),
                'cases_surgery_pending': _safe_int(raw.get('cases_surgery_pending')),
                'cases_surgery_not_eligible': _safe_int(raw.get('cases_surgery_not_eligible')),
                # Follow-up
                'cases_followup_due': _safe_int(raw.get('cases_followup_due')),
                'cases_followup_completed': _safe_int(raw.get('cases_followup_completed')),
                'cases_lost_followup': _safe_int(raw.get('cases_lost_followup')),
                # Psychosocial
                'cases_counselling_provided': _safe_int(raw.get('cases_counselling_provided')),
                'cases_social_reintegration': _safe_int(raw.get('cases_social_reintegration')),
                # Barriers
                'main_barriers': raw.get('main_barriers') or '',
                'notes': raw.get('notes') or '',
            },
        )
        return obj, created


class FistulaCampaign(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_hash = models.CharField(max_length=30, unique=True, blank=True, db_index=True)

    submission = models.OneToOneField(
        'submissions.KoboSubmission',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='fistula_campaign',
    )
    partner = models.CharField(max_length=20, db_index=True)
    district = models.CharField(max_length=100, blank=True)
    upazila = models.CharField(max_length=100, blank=True)
    union = models.CharField(max_length=100, blank=True)
    village = models.CharField(max_length=200, blank=True)
    facility_name = models.CharField(max_length=200, blank=True)
    region = models.CharField(max_length=100, blank=True)

    campaign_date = models.DateField()

    # Reach
    women_screened = models.PositiveIntegerField(default=0)
    women_reached_awareness = models.PositiveIntegerField(default=0)
    men_reached_awareness = models.PositiveIntegerField(default=0)
    community_sessions = models.PositiveSmallIntegerField(default=0)

    # Case identification
    suspected_fistula_cases = models.PositiveSmallIntegerField(default=0)
    confirmed_fistula_cases = models.PositiveSmallIntegerField(default=0)
    new_cases = models.PositiveSmallIntegerField(default=0)
    repeat_cases = models.PositiveSmallIntegerField(default=0)
    fistula_type = models.CharField(max_length=300, blank=True)
    fistula_cause = models.CharField(max_length=300, blank=True)

    # Referral
    cases_referred = models.PositiveSmallIntegerField(default=0)
    cases_accepted_referral = models.PositiveSmallIntegerField(default=0)
    cases_reached_facility = models.PositiveSmallIntegerField(default=0)

    # Surgery
    cases_surgery_completed = models.PositiveSmallIntegerField(default=0)
    cases_surgery_pending = models.PositiveSmallIntegerField(default=0)
    cases_surgery_not_eligible = models.PositiveSmallIntegerField(default=0)

    # Follow-up
    cases_followup_due = models.PositiveSmallIntegerField(default=0)
    cases_followup_completed = models.PositiveSmallIntegerField(default=0)
    cases_lost_followup = models.PositiveSmallIntegerField(default=0)

    # Psychosocial
    cases_counselling_provided = models.PositiveSmallIntegerField(default=0)
    cases_social_reintegration = models.PositiveSmallIntegerField(default=0)

    main_barriers = models.CharField(max_length=500, blank=True)
    notes = models.TextField(blank=True)

    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='fistula_campaigns_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = FistulaCampaignManager()

    class Meta:
        ordering = ['-campaign_date', '-created_at']
        verbose_name = 'Fistula Campaign Session'
        verbose_name_plural = 'Fistula Campaign Sessions'
        indexes = [
            models.Index(fields=['partner', 'campaign_date']),
            models.Index(fields=['district', 'campaign_date']),
        ]

    def save(self, *args, **kwargs):
        if not self.case_hash:
            year = self.campaign_date.year if self.campaign_date else timezone.now().year
            prefix = 'PHD' if self.partner == 'PHD' else 'BON'
            count = (
                FistulaCampaign.objects
                .filter(partner=self.partner, campaign_date__year=year)
                .count() + 1
            )
            self.case_hash = f'FST-{prefix}-{year}-{count:04d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.case_hash} — {self.district} ({self.campaign_date})'
