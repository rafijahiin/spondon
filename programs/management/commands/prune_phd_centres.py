"""
Prune PHD ServiceCenter rows to match SIDA SL8 target (9 brothel-based centres).

The earlier seed created 11 brothels + 1 SUB_DIC, plus the webhook fallback
auto-created stub centres ('AUTO-PHD'). Result: 14 active PHD centres on
Railway, making compute_SL8 return 14/9 = 156%.

This command keeps PHD-BROTHEL-01..09 active, deactivates everything else
PHD-tagged. Idempotent.

Run on Railway:
    PRUNE_PHD_CENTRES=1 → set in Variables → redeploy → unset.
"""
from django.core.management.base import BaseCommand
from programs.models import ServiceCenter


KEEP_CODES = {f'PHD-BROTHEL-{i:02d}' for i in range(1, 10)}


class Command(BaseCommand):
    help = 'Deactivate non-canonical PHD centres so SL8 (target 9) is honest.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm', action='store_true',
            help='Actually deactivate. Without this, only counts are shown.',
        )

    def handle(self, *args, **options):
        confirm = options['confirm']

        active = ServiceCenter.objects.filter(organisation='PHD', is_active=True)
        keep = active.filter(code__in=KEEP_CODES)
        drop = active.exclude(code__in=KEEP_CODES)

        self.stdout.write(f'\nPHD centres — ' + ('PRUNING' if confirm else 'DRY RUN') + '\n')
        self.stdout.write(f'  keep   : {keep.count()} (PHD-BROTHEL-01..09)')
        self.stdout.write(f'  to drop: {drop.count()} (other PHD centres)')
        if drop.exists():
            self.stdout.write('  drop codes:')
            for c in drop.values_list('code', 'center_type'):
                self.stdout.write(f'    - {c[0]:<28}  type={c[1]}')

        if confirm and drop.exists():
            n = drop.update(is_active=False)
            self.stdout.write(self.style.SUCCESS(f'\n  Deactivated {n} rows.\n'))
        elif not confirm:
            self.stdout.write(self.style.WARNING(
                '\n  Run with --confirm to actually deactivate.\n'))
