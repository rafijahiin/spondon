"""READ-ONLY diagnostic: dump the daily-reporting card's composition per partner.

Prints what daily_reporting_activity returns and the exact model/status/created_at
breakdown that makes it up, so we can see what the "43 / 2 submissions in 24h"
actually are. Performs NO writes.
"""
import datetime

from django.apps import apps
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = 'READ-ONLY: dump daily-reporting composition per partner (no writes).'

    def handle(self, *args, **opts):
        from tracker.programs_query import daily_reporting_activity
        from submissions.models import KoboSubmission

        now = timezone.now()
        threshold = now - datetime.timedelta(hours=24)
        local_now = timezone.localtime(now)
        today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        self.stdout.write(f'now={now}  threshold(24h)={threshold}  today_start={today_start}')

        models = list(apps.get_app_config('programs').get_models())
        for al, mn in (('mpdsr', 'MPDSRCase'), ('mpdsr', 'MPDSRAction'),
                       ('mpdsr', 'MaternalNearMissCase'),
                       ('mpdsr', 'MPDSRDeathNotification'),
                       ('fistula', 'CIPRBFistulaCase')):
            try:
                models.append(apps.get_model(al, mn))
            except Exception:
                pass

        for partner in ('PHD', 'Bandhu', 'CIPRB'):
            self.stdout.write(f'\n===== {partner} =====')
            recent, today, codes, last = daily_reporting_activity(
                partner, threshold, today_start)
            self.stdout.write(
                f'  daily_reporting_activity -> recent={recent} today={today} last={last}')

            ks = KoboSubmission.objects.filter(partner=partner, submitted_at__gte=threshold)
            self.stdout.write(
                f'  KoboSubmission(24h): total={ks.count()} '
                + ' '.join(f'{s}={ks.filter(status=s).count()}'
                           for s in ('pending', 'approved', 'rejected')))

            for model in models:
                fields = {f.name for f in model._meta.get_fields()}
                if not {'organisation', 'created_at', 'approval_status'} <= fields:
                    continue
                qs = model.objects.filter(organisation=partner, created_at__gte=threshold)
                n = qs.count()
                if n == 0:
                    continue
                by = {}
                for st in qs.values_list('approval_status', flat=True):
                    by[st] = by.get(st, 0) + 1
                first_ca = qs.order_by('created_at').values_list('created_at', flat=True).first()
                last_ca = qs.order_by('-created_at').values_list('created_at', flat=True).first()
                self.stdout.write(
                    f'    {model._meta.app_label}.{model.__name__}: 24h={n} :: '
                    + ' '.join(f'{k}={v}' for k, v in sorted(by.items()))
                    + f'  | created_at {first_ca} .. {last_ca}')

            # Also: ALL-TIME totals for this partner across the same models, to see
            # whether the wipe really cleared everything or rows predate the 24h.
            all_time = 0
            for model in models:
                fields = {f.name for f in model._meta.get_fields()}
                if not {'organisation', 'created_at', 'approval_status'} <= fields:
                    continue
                all_time += model.objects.filter(organisation=partner).count()
            self.stdout.write(f'  ALL-TIME programs+CIPRB rows for {partner}: {all_time}')

        self.stdout.write('\nDONE diag_daily_reporting.')
