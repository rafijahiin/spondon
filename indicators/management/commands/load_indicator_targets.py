"""
python manage.py load_indicator_targets

Loads all programme indicator targets from M&E frameworks.
Period: May 2026 – November 2026 (6-month contract).
Safe to run multiple times — uses update_or_create on (organisation, indicator_code, period_start).
"""
from datetime import date
from django.core.management.base import BaseCommand
from indicators.models import IndicatorTarget

PERIOD_START = date(2026, 5, 21)
PERIOD_END = date(2026, 11, 20)

BONDHU_TARGETS = [
    # Objective 1 — Service Delivery
    dict(code='BND_1_1', name='KP individuals receiving HIV/STI screening + FP counselling',
         target=4000, unit='individuals', objective='O1', activity_ref='A1.1'),
    dict(code='BND_1_2', name='GBV survivors screened and referred',
         target=200, unit='cases', objective='O1', activity_ref='A1.2'),
    dict(code='BND_1_3', name='MHPSS counselling sessions conducted',
         target=75, unit='sessions', objective='O1', activity_ref='A1.3'),
    dict(code='BND_1_4A', name='Group outreach/education sessions conducted',
         target=400, unit='sessions', objective='O1', activity_ref='A1.4'),
    dict(code='BND_1_4B', name='KP members reached via outreach',
         target=5000, unit='individuals', objective='O1', activity_ref='A1.4'),
    dict(code='BND_1_5', name='HIV/STI tests conducted',
         target=2000, unit='tests', objective='O1', activity_ref='A1.5'),
    dict(code='BND_1_5_centers', name='SRHR service centres operational',
         target=5, unit='centres', objective='O1', activity_ref='A1.5'),
    dict(code='BND_1_6', name='KP clinic operational (Dhaka)',
         target=1, unit='centres', objective='O1', activity_ref='A1.6'),
    dict(code='BND_1_7', name='KP referred and linked to ART/treatment',
         target=175, unit='individuals', objective='O1', activity_ref='A1.7'),
    dict(code='BND_1_8', name='DICs established and operational',
         target=5, unit='centres', objective='O1', activity_ref='A1.8'),
    dict(code='BND_1_9', name='KP individuals reached via mobile outreach',
         target=200, unit='individuals', objective='O1', activity_ref='A1.9'),
    # Objective 2 — Capacity Building
    dict(code='BND_2_1', name='Health managers oriented (UHC/DGHS/DGFP)',
         target=150, unit='individuals', objective='O2', activity_ref='A2.1'),
    dict(code='BND_2_2', name='Midwives / frontline providers trained',
         target=150, unit='individuals', objective='O2', activity_ref='A2.2'),
    dict(code='BND_2_3', name='GOB coordination meetings conducted',
         target=12, unit='meetings', objective='O2', activity_ref='A2.3'),
    dict(code='BND_2_4', name='CBO coordination meetings conducted',
         target=10, unit='meetings', objective='O2', activity_ref='A2.4'),
    dict(code='BND_2_5', name='Community leaders / Peer Educators trained',
         target=125, unit='individuals', objective='O2', activity_ref='A2.5'),
    # Objective 4 — SBCC / IEC
    dict(code='BND_4_1', name='IEC/SBCC materials distributed',
         target=50000, unit='pieces', objective='O4', activity_ref='A4.1'),
]

PHD_TARGETS = [
    # Objective 1 — Service Delivery
    dict(code='PHD_1_1', name='FSWs receiving HIV/STI screening + FP counselling',
         target=3484, unit='individuals', objective='O1', activity_ref='A1.1'),
    dict(code='PHD_1_2', name='GBV survivors identified and referred',
         target=100, unit='cases', objective='O1', activity_ref='A1.2'),
    dict(code='PHD_1_3', name='FSWs receiving mental health counselling',
         target=1000, unit='individuals', objective='O1', activity_ref='A1.3'),
    dict(code='PHD_1_4', name='Outreach sessions conducted',
         target=897, unit='sessions', objective='O1', activity_ref='A1.4'),
    dict(code='PHD_1_5A', name='Condoms distributed',
         target=679380, unit='pieces', objective='O1', activity_ref='A1.5'),
    dict(code='PHD_1_5B', name='Syphilis screening kits used',
         target=140, unit='boxes', objective='O1', activity_ref='A1.5'),
    dict(code='PHD_1_5C', name='Hepatitis B screening kits used',
         target=176, unit='boxes', objective='O1', activity_ref='A1.5'),
    dict(code='PHD_1_5D', name='Hepatitis C screening kits used',
         target=176, unit='boxes', objective='O1', activity_ref='A1.5'),
    dict(code='PHD_1_5E', name='HIV screening kits used',
         target=70, unit='boxes', objective='O1', activity_ref='A1.5'),
    dict(code='PHD_1_6', name='HIV/STI positive cases linked to treatment',
         target=190, unit='individuals', objective='O1', activity_ref='A1.6'),
    dict(code='PHD_1_7', name='Functional SRHR service centres',
         target=9, unit='centres', objective='O1', activity_ref='A1.7'),
    dict(code='PHD_1_8', name='Mobile health camps conducted',
         target=40, unit='camps', objective='O1', activity_ref='A1.8'),
    dict(code='PHD_1_9', name='Brothels covered',
         target=11, unit='brothels', objective='O1', activity_ref='A1.9'),
    # Objective 2 — Capacity Building
    dict(code='PHD_2_1', name='DGFP managers + GOB district staff oriented',
         target=173, unit='individuals', objective='O2', activity_ref='A2.1',
         notes='Target: 33 DGFP managers + 140 GOB district staff'),
    dict(code='PHD_2_2', name='MAs / Midwives trained',
         target=10, unit='individuals', objective='O2', activity_ref='A2.2'),
    dict(code='PHD_2_3', name='Peer Educators trained',
         target=33, unit='individuals', objective='O2', activity_ref='A2.3'),
    dict(code='PHD_2_4', name='Coordination meetings conducted',
         target=18, unit='meetings', objective='O2', activity_ref='A2.4'),
]


class Command(BaseCommand):
    help = 'Load indicator targets for Bondhu and PHD (May–November 2026)'

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0

        all_targets = (
            [('Bondhu', t) for t in BONDHU_TARGETS] +
            [('PHD', t) for t in PHD_TARGETS]
        )

        for org, t in all_targets:
            obj, created = IndicatorTarget.objects.update_or_create(
                organisation=org,
                indicator_code=t['code'],
                period_start=PERIOD_START,
                defaults={
                    'indicator_name': t['name'],
                    'target_value': t['target'],
                    'unit': t['unit'],
                    'objective': t.get('objective', ''),
                    'activity_ref': t.get('activity_ref', ''),
                    'notes': t.get('notes', ''),
                    'period_end': PERIOD_END,
                    'is_active': True,
                }
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'  Created: [{org}] {t["code"]} — {t["name"][:55]}'))
            else:
                updated_count += 1
                self.stdout.write(f'  Updated: [{org}] {t["code"]}')

        self.stdout.write(
            self.style.SUCCESS(
                f'\nDone. Created: {created_count}, Updated: {updated_count}'
            )
        )
