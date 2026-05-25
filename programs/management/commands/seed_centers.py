"""
python manage.py seed_centers

Seeds ServiceCenter records for both organisations.

Gating
------
This command no-ops unless SEED_DB is truthy in the environment, so it
will not silently overwrite manager-edited centres on every Railway
container restart.

Idempotency
-----------
Uses get_or_create (NOT update_or_create) so existing rows are left
untouched. Only missing rows are added. Manager edits to lat/lng/name
survive.
"""
import os

from django.core.management.base import BaseCommand
from programs.models import ServiceCenter


def _seed_db_enabled() -> bool:
    raw = os.environ.get('SEED_DB', '').strip().lower()
    return raw not in ('', '0', 'false', 'no', 'off')

BONDHU_DICS = [
    {
        'code': 'BND-DIC-01',
        'name': 'Bandhu DIC Sunamganj',
        'name_bangla': 'বন্ধু ডিআইসি সুনামগঞ্জ',
        'center_type': 'DIC',
        'district': 'Sunamganj',
        'upazila': 'Sunamganj Sadar',
        'lat': 24.8817,
        'lng': 91.4053,
    },
    {
        'code': 'BND-DIC-02',
        'name': 'Bandhu DIC Bandarban',
        'name_bangla': 'বন্ধু ডিআইসি বান্দরবান',
        'center_type': 'DIC',
        'district': 'Bandarban',
        'upazila': 'Bandarban Sadar',
        'lat': 22.1953,
        'lng': 92.2184,
    },
    {
        'code': 'BND-DIC-03',
        'name': 'Bandhu DIC Chandpur',
        'name_bangla': 'বন্ধু ডিআইসি চাঁদপুর',
        'center_type': 'DIC',
        'district': 'Chandpur',
        'upazila': 'Chandpur Sadar',
        'lat': 23.2333,
        'lng': 90.6500,
    },
    {
        'code': 'BND-DIC-04',
        'name': 'Bandhu DIC Noakhali',
        'name_bangla': 'বন্ধু ডিআইসি নোয়াখালী',
        'center_type': 'DIC',
        'district': 'Noakhali',
        'upazila': 'Noakhali Sadar',
        'lat': 22.8697,
        'lng': 91.0994,
    },
    {
        'code': 'BND-DIC-05',
        'name': 'Bandhu DIC Dhaka',
        'name_bangla': 'বন্ধু ডিআইসি ঢাকা',
        'center_type': 'DIC',
        'district': 'Dhaka',
        'upazila': 'Dhaka Sadar',
        'lat': 23.7104,
        'lng': 90.4074,
    },
]

PHD_BROTHELS = [
    {
        'code': f'PHD-BROTHEL-{i:02d}',
        'name': f'PHD Brothel {i:02d}',
        'name_bangla': f'পিএইচডি পল্লী {i:02d}',
        'center_type': 'BROTHEL',
        'district': 'Tangail',
        'upazila': 'Tangail Sadar',
        'lat': 24.2513 + (i * 0.02),
        'lng': 89.9167 + (i * 0.01),
    }
    for i in range(1, 12)
]

PHD_SUB_DICS = [
    {
        'code': 'PHD-SRHR-01',
        'name': 'PHD SRHR Service Centre 01',
        'name_bangla': 'পিএইচডি এসআরএইচআর সেবা কেন্দ্র ০১',
        'center_type': 'SUB_DIC',
        'district': 'Tangail',
        'upazila': 'Tangail Sadar',
        'lat': 24.2513,
        'lng': 89.9167,
    },
]


class Command(BaseCommand):
    help = 'Seed ServiceCenter records for Bandhu (5 DICs) and PHD (11 brothels + 1 SRHR centre)'

    def handle(self, *args, **options):
        if not _seed_db_enabled():
            self.stdout.write(
                'SEED_DB is not set — seed_centers is a no-op. '
                'Set SEED_DB=1 to enable.'
            )
            return

        created_count = 0
        skipped_count = 0

        all_centers = [
            ('Bandhu', c) for c in BONDHU_DICS
        ] + [
            ('PHD', c) for c in PHD_BROTHELS
        ] + [
            ('PHD', c) for c in PHD_SUB_DICS
        ]

        for org, data in all_centers:
            obj, created = ServiceCenter.objects.get_or_create(
                code=data['code'],
                defaults={
                    'organisation': org,
                    'name': data['name'],
                    'name_bangla': data.get('name_bangla', ''),
                    'center_type': data['center_type'],
                    'district': data.get('district', ''),
                    'upazila': data.get('upazila', ''),
                    'latitude': data.get('lat'),
                    'longitude': data.get('lng'),
                    'is_active': True,
                }
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'  Created: {obj}'))
            else:
                skipped_count += 1
                self.stdout.write(f'  Exists (untouched): {obj}')

        self.stdout.write(
            self.style.SUCCESS(
                f'\nseed_centers done. created={created_count} '
                f'exists_untouched={skipped_count}'
            )
        )
