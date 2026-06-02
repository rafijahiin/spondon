"""Seed plausible demo MPDSR cases so the CIPRB dashboard visualisations render.

Idempotent: uses a stable case_hash prefix `DEMO-` so re-runs do nothing.
Removable: `--purge` deletes only DEMO- rows; production data is untouched.
"""
import datetime
import random

from django.core.management.base import BaseCommand
from django.utils import timezone

from mpdsr.models import MPDSRCase, DeathType, PlaceOfDeath, ReviewStatus


# Per MPDSR Form 01 (Sayed 2026-06-02) — GoB ICD-10 cause taxonomy.
# Weighted to reflect typical Bangladesh maternal-mortality cause profile:
# Haemorrhage and Eclampsia together dominate (~50%), then Sepsis,
# Obstructed Labour, Abortion-related, Other Direct.
CAUSES = [
    # Haemorrhage cluster (35%)
    'PPH (Postpartum Haemorrhage)',
    'PPH (Postpartum Haemorrhage)',
    'APH (Antepartum Haemorrhage)',
    'Placenta Previa',
    'Abruptio placentae',
    'Rupture Uterus',
    'Haemorrhage in Early Pregnancy',
    # Eclampsia (18%)
    'Eclampsia',
    'Eclampsia',
    'Eclampsia',
    # Sepsis (12%)
    'Puerperal Sepsis',
    'Puerperal Sepsis',
    # Obstructed Labour (10%)
    'Obstructed Labour due to Malposition',
    'Obstructed Labour',
    # Abortion-related (10%)
    'Unsafe / Failed Abortion',
    'Ectopic Pregnancy',
    # Other Direct (15%)
    'Complication of Anaesthesia',
    'Obstetric Embolism',
    'Malnutrition in pregnancy',
]

PLACES = [PlaceOfDeath.FACILITY, PlaceOfDeath.HOME, PlaceOfDeath.IN_TRANSIT]

DEMO_PROFILE = {
    'Bandarban':    {'md': 6, 'pd': 2},
    'Barguna':      {'md': 14, 'pd': 5},
    'Chandpur':     {'md': 32, 'pd': 11},
    'Gaibandha':    {'md': 27, 'pd': 9},
    'Khagrachari':  {'md': 10, 'pd': 3},
    'Noakhali':     {'md': 41, 'pd': 14},
    'Patuakahli':   {'md': 35, 'pd': 12},
}


class Command(BaseCommand):
    help = 'Seed demo MPDSR rows for the CIPRB dashboard visualisations (idempotent).'

    def add_arguments(self, parser):
        parser.add_argument('--purge', action='store_true',
                            help='Delete demo rows instead of seeding.')

    def handle(self, *args, **opts):
        if opts['purge']:
            n, _ = MPDSRCase.objects.filter(case_hash__startswith='DEMO-').delete()
            self.stdout.write(self.style.WARNING(f'Purged {n} demo MPDSR rows.'))
            return

        rng = random.Random(20260602)
        today = timezone.now().date()
        created = 0
        skipped = 0

        for district, prof in DEMO_PROFILE.items():
            for i in range(prof['md']):
                case_hash = f'DEMO-MD-{district}-{i}'
                if MPDSRCase.objects.filter(case_hash=case_hash).exists():
                    skipped += 1
                    continue
                dod = today - datetime.timedelta(
                    days=rng.randint(0, 11) if rng.random() < 0.7 else rng.randint(12, 165)
                )
                MPDSRCase.objects.create(
                    case_hash=case_hash,
                    partner='CIPRB',
                    district=district,
                    sub_form_type='f2',
                    date_of_death=dod,
                    death_type=DeathType.MATERNAL,
                    cause_of_death=rng.choice(CAUSES),
                    place_of_death=rng.choice(PLACES),
                    facility_name=f'{district} UHC',
                    age_years=rng.randint(18, 42),
                    status=ReviewStatus.REPORTED,
                    audit_trail=[{
                        'timestamp': timezone.now().isoformat(),
                        'user': 'demo_seeder',
                        'action': 'Seeded demo MPDSR case',
                    }],
                    source='demo_seed',
                )
                created += 1

            for i in range(prof['pd']):
                case_hash = f'DEMO-PD-{district}-{i}'
                if MPDSRCase.objects.filter(case_hash=case_hash).exists():
                    skipped += 1
                    continue
                dod = today - datetime.timedelta(
                    days=rng.randint(0, 11) if rng.random() < 0.7 else rng.randint(12, 165)
                )
                MPDSRCase.objects.create(
                    case_hash=case_hash,
                    partner='CIPRB',
                    district=district,
                    sub_form_type='f3',
                    date_of_death=dod,
                    death_type=DeathType.PERINATAL,
                    cause_of_death='Birth Asphyxia' if i % 2 == 0 else 'Prematurity',
                    place_of_death=rng.choice(PLACES),
                    facility_name=f'{district} UHC',
                    status=ReviewStatus.REPORTED,
                    audit_trail=[{
                        'timestamp': timezone.now().isoformat(),
                        'user': 'demo_seeder',
                        'action': 'Seeded demo MPDSR case',
                    }],
                    source='demo_seed',
                )
                created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Demo MPDSR seed complete: {created} created, {skipped} skipped (idempotent).'
        ))
