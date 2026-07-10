"""Clear D5 baseline data so live collection starts from a clean slate.

BASELINE ONLY. No other form type, model, partner or org is touched — the filter
is `form_type=FormType.BASELINE` plus the two baseline-only models.

GOTCHA (the reason this command exists instead of a plain delete):
`BaselineResponse.submission` and `BaselineSurvey.submission` are
OneToOneField(on_delete=models.SET_NULL). Deleting the KoboSubmission therefore
does NOT remove the response row — it ORPHANS it (submission=NULL), and the
dashboard keeps showing it, because insights/srhr read BaselineResponse, not the
submissions. So the response rows are deleted explicitly, and `--scope all` also
sweeps any pre-existing orphans.

Scopes:
  --scope demo : only the seeded demo rows (kobo_id starts with DEMO-BL-)
  --scope all  : EVERY baseline submission + EVERY BaselineResponse/BaselineSurvey
                 row (incl. orphans) — a true zero, for a fresh live collection.

Dry-run by default; pass --commit to actually delete.

Prod's DB is reachable only from inside Railway, so this runs via the Dockerfile
boot gate FLUSH_BASELINE_DATA=demo|all (set → redeploy → verify → unset), the
same pattern as SEED_BASELINE_DEMO / PURGE_TEST_BASELINE.
"""
from django.core.management.base import BaseCommand

from baseline.models import BaselineResponse, BaselineSurvey
from submissions.models import FormType, KoboSubmission

PREFIX = 'DEMO-BL-'


class Command(BaseCommand):
    help = 'Delete baseline submissions + response rows (scope: demo|all). Baseline only.'

    def add_arguments(self, parser):
        parser.add_argument('--scope', choices=['demo', 'all'], default='demo',
                            help="'demo' = DEMO-BL- rows only; 'all' = every baseline row.")
        parser.add_argument('--commit', action='store_true',
                            help='Actually delete (default is a dry run).')

    def handle(self, *args, **opts):
        scope = opts['scope']
        base = KoboSubmission.objects.filter(form_type=FormType.BASELINE)
        demo = base.filter(kobo_id__startswith=PREFIX)
        nondemo = base.exclude(kobo_id__startswith=PREFIX)

        resp_all = BaselineResponse.objects.all()
        orphans = resp_all.filter(submission__isnull=True)

        self.stdout.write('── Baseline data on this database ──')
        self.stdout.write(f'  KoboSubmission (BASELINE): {base.count()}  '
                          f'(demo {demo.count()} · non-demo {nondemo.count()})')
        self.stdout.write(f'  BaselineResponse rows    : {resp_all.count()}  '
                          f'(orphaned/submission=NULL: {orphans.count()})')
        self.stdout.write(f'  BaselineSurvey rows      : {BaselineSurvey.objects.count()}')

        subs = demo if scope == 'demo' else base
        sub_ids = list(subs.values_list('id', flat=True))
        resp = resp_all if scope == 'all' else resp_all.filter(submission_id__in=sub_ids)

        self.stdout.write(f'── scope={scope}: would delete {len(sub_ids)} submission(s) '
                          f'+ {resp.count()} response row(s) ──')
        if scope == 'demo' and orphans.exists():
            self.stdout.write('  NOTE: orphaned response rows survive scope=demo. Use --scope all '
                              'for a true zero.')

        if not opts['commit']:
            self.stdout.write('Dry run — pass --commit to delete.')
            return

        surv_q = (BaselineSurvey.objects.all() if scope == 'all'
                  else BaselineSurvey.objects.filter(submission_id__in=sub_ids))
        n_surv = surv_q.count()
        surv_q.delete()
        n_resp = resp.count()
        resp.delete()
        n_sub = len(sub_ids)
        KoboSubmission.objects.filter(id__in=sub_ids).delete()

        self.stdout.write(f'Deleted {n_sub} submission(s), {n_resp} response row(s), '
                          f'{n_surv} legacy survey row(s).')
        left_sub = KoboSubmission.objects.filter(form_type=FormType.BASELINE).count()
        left_resp = BaselineResponse.objects.count()
        self.stdout.write(f'Remaining baseline → submissions={left_sub}  responses={left_resp}')
        if left_sub == 0 and left_resp == 0:
            self.stdout.write('Baseline is empty — ready for live Kobo data.')
