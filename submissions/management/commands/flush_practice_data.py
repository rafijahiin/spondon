"""Full clean-slate wipe of all PRACTICE / demo / Excel submission + case data.

Rafi's 2026-06-28 directive: every submission in the system so far is practice
data (form testing/training). Wipe it ALL so the dashboards start from zero and
populate only from real field data going forward.

DELETES (all rows):
  - submissions.KoboSubmission
  - every programs submission model (Client, ClinicVisit, HIV/STI, GBV, Referral,
    Outreach, Training, NilReport, …) — anything carrying approval_status
  - mpdsr: MPDSRCase, MaternalNearMissCase, MPDSRDeathNotification, MPDSRAction,
    MPDSRActionPlanSummary, MPDSRFacilityCount, MPDSRDistrictDenominator (Excel)
  - fistula: CIPRBFistulaCase, FistulaCornerCase, FistulaCampaign, FistulaCampaignVisit
  - baseline: BaselineResponse, BaselineSurvey
  - tracker.Alert (generated)
  - demo ServiceCenters (code PHD-* / BANDHU-* from seed_demo)

KEEPS (configuration — NOT submission data):
  - accounts.User, partners.Partner
  - programs.ServiceCenter (the real wellness-centre registry; only demo-prefixed
    rows are removed)
  - indicators.IndicatorTarget + KoboFormMapping, tracker.MonthlyTarget

Dry-run by default (prints counts). Pass --confirm to actually delete. The delete
runs inside one transaction, so an unexpected protected-FK error rolls back the
whole thing rather than leaving a half-wiped DB.
"""
from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q


class Command(BaseCommand):
    help = 'Wipe ALL practice/demo/Excel submission + case data (full clean slate).'

    def add_arguments(self, parser):
        parser.add_argument('--confirm', action='store_true',
                            help='Actually delete. Without this it is a dry run.')

    def _ordered_targets(self):
        """(label, queryset) pairs in FK-safe delete order: leaves first, then
        the PROTECT parents (Client, then demo ServiceCenters) last."""
        targets = []

        # 1. mpdsr case/aggregate models (FK to KoboSubmission is SET_NULL).
        from mpdsr.models import (
            MPDSRCase, MPDSRAction, MPDSRActionPlanSummary,
            MPDSRFacilityCount, MPDSRDistrictDenominator,
        )
        from mpdsr.ciprb_models import MaternalNearMissCase, MPDSRDeathNotification
        for m in (MPDSRCase, MPDSRAction, MPDSRActionPlanSummary,
                  MPDSRFacilityCount, MPDSRDistrictDenominator,
                  MaternalNearMissCase, MPDSRDeathNotification):
            targets.append((f'mpdsr.{m.__name__}', m.objects.all()))

        # 2. fistula case models.
        from fistula.models import FistulaCornerCase, FistulaCampaign, FistulaCampaignVisit
        from fistula.ciprb_models import CIPRBFistulaCase
        for m in (CIPRBFistulaCase, FistulaCornerCase, FistulaCampaign, FistulaCampaignVisit):
            targets.append((f'fistula.{m.__name__}', m.objects.all()))

        # 3. baseline.
        from baseline.models import BaselineResponse, BaselineSurvey
        for m in (BaselineResponse, BaselineSurvey):
            targets.append((f'baseline.{m.__name__}', m.objects.all()))

        # 4. tracker generated alerts (keeps MonthlyTarget config).
        from tracker.models import Alert
        targets.append(('tracker.Alert', Alert.objects.all()))

        # 5. programs submission models (anything with approval_status), Client LAST
        #    because ClinicVisit/HIVSTITest/… reference it with on_delete=PROTECT.
        from programs.models import Client, ServiceCenter
        prog_models = [
            m for m in apps.get_app_config('programs').get_models()
            if any(f.name == 'approval_status' for f in m._meta.get_fields())
        ]
        for m in sorted(prog_models, key=lambda x: x is Client):  # Client (True) sorts last
            targets.append((f'programs.{m.__name__}', m.objects.all()))

        # 6. legacy KoboSubmission (all). Deleted after the case/programs rows that
        #    reference it (those FKs are SET_NULL, but delete after them anyway).
        from submissions.models import KoboSubmission
        targets.append(('submissions.KoboSubmission', KoboSubmission.objects.all()))

        # 7. demo ServiceCenters only (real registry kept). Deleted last, after the
        #    rows that PROTECT-reference them are gone.
        targets.append((
            'programs.ServiceCenter[demo PHD-/BANDHU-]',
            ServiceCenter.objects.filter(
                Q(code__startswith='PHD-') | Q(code__startswith='BANDHU-')),
        ))
        return targets

    def handle(self, *args, **opts):
        confirm = opts['confirm']
        targets = self._ordered_targets()

        self.stdout.write(self.style.MIGRATE_HEADING(
            'Practice-data flush — rows found:'))
        total = 0
        for label, qs in targets:
            c = qs.count()
            total += c
            self.stdout.write(f'  {label:46s} {c}')
        self.stdout.write(f'  {"TOTAL":46s} {total}')

        if not confirm:
            self.stdout.write(self.style.WARNING(
                'DRY RUN — nothing deleted. Re-run with --confirm to wipe.'))
            return

        with transaction.atomic():
            deleted_total = 0
            for label, qs in targets:
                n, _ = qs.delete()
                deleted_total += n
                self.stdout.write(self.style.SUCCESS(f'  deleted {label:40s} {n}'))
            self.stdout.write(self.style.SUCCESS(
                f'DONE — full clean slate. {deleted_total} rows removed.'))
