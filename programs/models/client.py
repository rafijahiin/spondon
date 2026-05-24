"""
Client — the master client registry (Mother List).
Every service event links back to a Client record.
"""
import uuid
from django.db import models
from .._base_choices import ORG_CHOICES
from ._base import TimestampedModel


class Client(TimestampedModel):
    # --- Gender ---
    MALE = '01'
    FEMALE = '02'
    TRANSGENDER = '03'
    OTHER_GENDER = '04'
    GENDER_CHOICES = [
        (MALE, 'Male'),
        (FEMALE, 'Female'),
        (TRANSGENDER, 'Transgender'),
        (OTHER_GENDER, 'Other'),
    ]

    # --- Target Group (Key Population) ---
    MSM = '01'
    MSW = '02'
    TG_KP = '03'
    OTHERS_KP = '04'
    FSW = '05'
    PWID = '06'
    TG_CHOICES = [
        (MSM, 'MSM'),
        (MSW, 'MSW / Kothi'),
        (TG_KP, 'Transgender'),
        (OTHERS_KP, 'Others'),
        (FSW, 'FSW'),
        (PWID, 'PWID'),
    ]

    # --- Client Status ---
    ACTIVE = '1'
    JAILED = '2'
    RELOCATED = '3'
    OTHER_STATUS = '4'
    DECEASED = '5'
    NOT_FOUND = '6'
    STATUS_CHOICES = [
        (ACTIVE, 'Active'),
        (JAILED, 'Jailed'),
        (RELOCATED, 'Relocated'),
        (OTHER_STATUS, 'Other'),
        (DECEASED, 'Deceased'),
        (NOT_FOUND, 'Not Found'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.CharField(max_length=20, choices=ORG_CHOICES, db_index=True)
    center = models.ForeignKey(
        'programs.ServiceCenter',
        on_delete=models.PROTECT,
        related_name='clients',
    )
    client_id = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=200)
    mother_name = models.CharField(max_length=200, blank=True)
    father_name = models.CharField(max_length=200, blank=True)

    # Demographics
    birth_year = models.PositiveSmallIntegerField(null=True, blank=True)
    gender = models.CharField(max_length=2, choices=GENDER_CHOICES, blank=True)
    target_group_code = models.CharField(max_length=2, choices=TG_CHOICES, blank=True)

    # Location
    current_address = models.TextField(blank=True)
    spot_name = models.CharField(max_length=200, blank=True)

    # Socioeconomic
    marital_status = models.CharField(max_length=1, blank=True)
    education_level = models.CharField(max_length=1, blank=True)
    occupation_code = models.CharField(max_length=1, blank=True)

    # FSW-specific
    years_in_profession = models.PositiveSmallIntegerField(null=True, blank=True)
    avg_clients_per_day = models.PositiveSmallIntegerField(null=True, blank=True)
    children_under_18 = models.PositiveSmallIntegerField(null=True, blank=True)
    uses_injecting_drugs = models.BooleanField(null=True)
    has_nid = models.BooleanField(null=True)
    uses_fp_method = models.BooleanField(null=True)

    enrolled_date = models.DateField(null=True, blank=True)
    current_status = models.CharField(max_length=1, choices=STATUS_CHOICES, default=ACTIVE)
    telegram_chat_id = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-enrolled_date']

    def __str__(self):
        return f'{self.client_id} — {self.name} ({self.organisation})'
