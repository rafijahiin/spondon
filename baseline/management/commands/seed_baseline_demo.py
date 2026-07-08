"""Seed realistic demo baseline interviews (Hijra + FSW) so the /baseline
dashboard shows real insights and the verification card shows real detail.

Creates PENDING KoboSubmissions with plausible answers keyed to the two live
forms' real field codes, then APPROVES most (the post_save signal materialises
the verified BaselineResponse), leaving a few PENDING to demo the review queue.

    python manage.py seed_baseline_demo --hijra 24 --fsw 20 --pending 6 --wipe

Idempotent-ish: --wipe first removes any prior demo rows (kobo_id prefix
DEMO-BL-) so re-runs don't accumulate. Demo-only; never run against real data
without --wipe intent.
"""
import json
import os
import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models.signals import post_save
from django.utils import timezone

from baseline.models import BaselineResponse
from submissions.models import FormType, KoboSubmission, SubmissionStatus

PREFIX = 'DEMO-BL-'
SCHEMA = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'form_schema.json')

XFORM = {'hijra': 'ciprb_baseline_hijra_v1', 'fsw': 'ciprb_baseline_fsw_v1'}
INTERVIEWERS = ['Shipra Rani / IV-01', 'Rahim Uddin / IV-02', 'Nadia Akter / IV-03',
                'Jamal Hossain / IV-04', 'Papri Das / IV-05', 'Sohel Rana / IV-06']
# rough district -> (lat, lng) for plausible GPS
GEO = {
    'sunamganj': (25.07, 91.40), 'habiganj': (24.37, 91.41), 'manikganj': (23.86, 90.00),
    'narayanganj': (23.62, 90.50), 'chandpur': (23.23, 90.66), 'noakhali': (22.87, 91.10),
    'chittagong': (22.36, 91.83), 'bandarban': (22.19, 92.22), 'rajbari': (23.76, 89.64),
    'faridpur': (23.60, 89.84), 'jashore': (23.17, 89.21), 'khulna': (22.85, 89.56),
    'dhaka': (23.81, 90.41),
}


def _pick(cmap, weights_by_code=None):
    """Pick a code from a {code: label} choice dict; optional weights add realism."""
    codes = list((cmap or {}).keys())
    if not codes:
        return None
    if weights_by_code:
        w = [weights_by_code.get(c, 1) for c in codes]
        return random.choices(codes, weights=w, k=1)[0]
    return random.choice(codes)


class Command(BaseCommand):
    help = 'Seed realistic demo baseline interviews for the /baseline dashboard.'

    def add_arguments(self, parser):
        parser.add_argument('--hijra', type=int, default=24)
        parser.add_argument('--fsw', type=int, default=20)
        parser.add_argument('--pending', type=int, default=6,
                            help='How many to leave PENDING (rest are approved).')
        parser.add_argument('--wipe', action='store_true',
                            help='Remove prior DEMO-BL- rows before seeding.')

    def handle(self, *args, **opts):
        with open(SCHEMA, encoding='utf-8') as f:
            schema = json.load(f)

        if opts['wipe']:
            subs = KoboSubmission.objects.filter(kobo_id__startswith=PREFIX)
            BaselineResponse.objects.filter(submission__in=subs).delete()
            n = subs.count()
            subs.delete()
            self.stdout.write(f'Wiped {n} prior demo submission(s).')

        # Seed with the approval post_save signal DISCONNECTED: on prod each save
        # would otherwise fan out telegram + email notifications, and this service
        # has no outbound network — the stalled calls blow past the boot healthcheck
        # window. We materialise the verified BaselineResponse directly instead.
        from submissions.signals import on_submission_status_change
        post_save.disconnect(on_submission_status_change, sender=KoboSubmission)
        try:
            plan = [('hijra', opts['hijra']), ('fsw', opts['fsw'])]
            made = []
            used_ids = []
            seq = 0
            for pop, count in plan:
                for i in range(count):
                    seq += 1
                    raw = self._build_raw(pop, schema[pop], seq)
                    dist = raw.get('district', 'dhaka')
                    lat, lng = GEO.get(dist, GEO['dhaka'])
                    jitter = lambda: random.uniform(-0.05, 0.05)
                    gps_missing = random.random() < 0.08
                    # ── Fieldwork signals (for the monitoring dashboard) ──
                    iv = random.choice(INTERVIEWERS)          # 'Name / IV-0X'
                    dc = iv.split('/')[-1].strip()            # collector code IV-0X
                    submitted = timezone.now() - timedelta(
                        days=random.randint(0, 18), hours=random.randint(8, 20),
                        minutes=random.randint(0, 59))
                    # duration mostly 22–55 min; ~6% suspiciously short (rushed flag)
                    dur = random.randint(3, 8) if random.random() < 0.06 else int(
                        random.triangular(22, 55, 38))
                    start = submitted - timedelta(minutes=dur)
                    outcome = random.choices(['1', '2', '3', '4'],
                                             weights=[86, 7, 4, 3], k=1)[0]
                    # ~4% share a prior submission_id → duplicate flag demo
                    if used_ids and random.random() < 0.04:
                        sub_id = random.choice(used_ids)
                    else:
                        sub_id = f'{dc}-{dist[:3].upper()}-{seq:05d}'
                        used_ids.append(sub_id)
                    raw.update({
                        'dc_code': dc, 'c3': outcome,
                        'interview_start': start.strftime('%Y-%m-%dT%H:%M:%S'),
                        'interview_end': submitted.strftime('%Y-%m-%dT%H:%M:%S'),
                        'submission_id': sub_id,
                    })
                    sub = KoboSubmission.objects.create(
                        kobo_id=f'{PREFIX}{pop}-{seq:04d}',
                        form_type=FormType.BASELINE,
                        partner='CIPRB',
                        worker_name=iv,
                        district=dist.title(),
                        region='',
                        latitude=None if gps_missing else round(lat + jitter(), 6),
                        longitude=None if gps_missing else round(lng + jitter(), 6),
                        submitted_at=submitted,
                        raw_data=raw,
                        status=SubmissionStatus.PENDING,
                    )
                    made.append(sub)

            # Approve all but the last N (kept PENDING to demo the review queue).
            random.shuffle(made)
            keep_pending = max(0, opts['pending'])
            approve = made[keep_pending:]
            for sub in approve:
                sub.status = SubmissionStatus.APPROVED
                sub.reviewed_at = timezone.now()
                sub.save(update_fields=['status', 'reviewed_at'])
                BaselineResponse.objects.get_or_create_from_submission(sub)
        finally:
            post_save.connect(on_submission_status_change, sender=KoboSubmission)

        verified = BaselineResponse.objects.filter(submission__kobo_id__startswith=PREFIX).count()
        self.stdout.write(self.style.SUCCESS(
            f'Seeded {len(made)} interviews · approved {len(approve)} '
            f'(verified rows: {verified}) · {keep_pending} left pending.'))

    # ── realistic answer generation ──────────────────────────────────────────
    def _build_raw(self, pop, ps, seq):
        # ps = form_schema[pop] with choices / types / order. pick() reads by field name.
        ch = ps['choices']
        types = ps['types']
        order = ps['order']

        def pick(field, weights=None):
            return _pick(ch.get(field), weights)

        age = int(random.triangular(18, 45, 26))
        serial = f'{PREFIX}{pop.upper()}-{seq:04d}'
        base = {
            '_xform_id_string': XFORM[pop],
            'population': pop,
            'questionnaire_serial': serial,
            'consent': '1',
            'interview_language': '1',
            'survey_round': 'baseline',
        }
        if pop == 'hijra':
            dist = pick('district')
            base.update({
                'district': dist,
                'a201_district': dist,
                'interview_method': '1',
                's1_selection': pick('s1_selection'),
                's2_age': age,
                's3_member': '1',
                's4_residence': pick('s4_residence'),
                'a102_respondent_type': pick('a102_respondent_type'),
                'a204_area': pick('a204_area'),
                'a205_age': age,
                'a206_religion': pick('a206_religion', {'1': 82, '2': 12}),
                'a207_ethnicity': pick('a207_ethnicity'),
                'a208_marital': pick('a208_marital'),
                'a209_education': pick('a209_education',
                                       {'00': 22, '01': 18, '05': 20, '08': 14, '10': 12}),
                'a210_student': pick('a210_student', {'2': 80}),
                'a211_mobile': pick('a211_mobile', {'1': 45, '2': 40, '3': 15}),
                'a212_nid': pick('a212_nid', {'1': 68, '2': 32}),
                'a301': pick('a301'),
                'a302_gender': pick('a302_gender'),
                'b101_live_with': pick('b101_live_with'),
                'b102_hh_members': random.randint(1, 8),
                'b104_share': int(random.triangular(2000, 40000, 9000)),
                'b108_worked': pick('b108_worked', {'1': 70}),
                'b111_main_occupation': pick('b111_main_occupation'),
            })
        else:  # fsw
            dist = pick('district')
            base.update({
                'district': dist,
                'site_code': pick('site_code'),
                's1_age': age,
                's2_sexwork': '1',
                's3_residence': pick('s3_residence'),
                'a203': age,
                'a204': pick('a204', {'1': 78, '2': 16}),
                'a205': pick('a205'),
                'a206': pick('a206'),
                'a207': pick('a207', {'00': 30, '01': 22, '05': 20, '08': 12, '10': 8}),
                'a208': pick('a208', {'1': 40, '2': 42, '3': 18}),
                'a209': pick('a209', {'1': 60, '2': 40}),
                'a213': random.randint(0, 4),
                'a214': random.randint(0, 3),
                'b101': pick('b101'),
                'b108': int(random.triangular(3000, 45000, 12000)),
                'b114': pick('b114'),
            })
        # ── Complete the rest of the questionnaire ────────────────────────────
        # A real baseline interview answers the whole ~180-question form, so a
        # reviewer can only verify a COMPLETE record. Fill every remaining field
        # with a valid, plausible value (the weighted fields above are kept as-is
        # so the charts stay realistic). Nothing is merged or summarised — each
        # answer is stored faithfully and shown verbatim on the approval card.
        def fill(name, typ):
            low = name.lower()
            if typ == 'geopoint':
                return None  # GPS lives on the submission row, not raw_data
            # conditional "other (specify)" free-text — left blank unless its
            # parent select actually chose "other", which we don't simulate.
            if 'other' in low or 'specify' in low or low.endswith(('_oth', '_txt')):
                return None
            cmap = ch.get(name)
            if cmap:
                codes = [c for c in cmap.keys() if c != '']
                if not codes:
                    return None
                if typ.startswith('select_multiple'):
                    k = min(len(codes), random.randint(1, 3))
                    return ' '.join(random.sample(codes, k))
                return random.choice(codes)
            if typ == 'integer':
                if 'age' in low:
                    return age
                if 'year' in low:
                    return random.randint(0, 15)
                if 'month' in low:
                    return random.randint(0, 11)
                if 'child' in low:
                    return random.randint(0, 4)
                if any(w in low for w in ('member', 'hh', 'people', 'person',
                                          'count', 'number', '_no', 'no_', 'times')):
                    return random.randint(1, 6)
                if any(w in low for w in ('income', 'taka', 'bdt', 'amount', 'rent',
                                          'commission', 'fee', 'debt', 'share', 'exp',
                                          'salary', 'money', 'earn', 'cost')):
                    return random.choice([0, 1500, 3000, 5000, 8000, 12000])
                return random.randint(0, 4)
            if typ == 'decimal':
                return random.choice([0, 1, 2, 3])
            if typ == 'date':
                return '2026-06-%02d' % random.randint(1, 28)
            if typ == 'time':
                return '%02d:%02d' % (random.randint(8, 17), random.choice([0, 15, 30, 45]))
            if typ == 'text':
                if any(w in low for w in ('name', 'code', 'interviewer', 'supervisor', 'enumerator')):
                    return 'Demo Field Staff'
                if 'upazila' in low or 'thana' in low:
                    return 'Sadar'
                if 'union' in low or 'ward' in low:
                    return 'Ward 3'
                if 'mobile' in low or 'phone' in low:
                    return '017' + str(random.randint(10000000, 99999999))
                if any(w in low for w in ('district', 'ancestral', 'home', 'address', 'place')):
                    return 'Dhaka'
                if any(w in low for w in ('serial', 'cluster', 'site')):
                    return name.upper()[:20]
                return None  # unknown free text → leave blank
            return None

        for name in order:
            if name in base:  # keep the weighted demographic fields as set above
                continue
            v = fill(name, types.get(name, 'text'))
            if v is not None:
                base[name] = v

        # drop any None (choice list absent) so we never store nulls
        return {k: v for k, v in base.items() if v is not None}
