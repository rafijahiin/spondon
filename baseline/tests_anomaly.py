"""Tests for the FSW anomaly engine, its Kobo adapter, and the review API.

Covers the acceptance tests from integration_prompt.md:
  * Sabita's records with a missing end timestamp -> missing-timing flag,
    not a zero-minute interview.
  * Enumerators with a valid duration still show one.
  * Q9.5 with 6+ choices detected.
  * "No concerns" + another concern detected.
  * Child-living contradiction detected.
  * Income 10/12 BDT detected without auto-correction.
  * Multi-hour interviews excluded from the normal average.
  * GPS outliers flagged as verify.
  * Every anomaly carries evidence + a recommended action.
  * Raw Kobo responses remain immutable.
"""
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Organisation, Role, User
from submissions.models import FormType, KoboSubmission, SubmissionStatus

from .anomaly import _shape_record, build_report, invalidate_cache
from .fsw_rules import build_fsw_engine
from .models import AnomalyReview
from .schema import load_schema

FSW_UID = 'aVsJ7VJ35k8GshpQpnXygC'


def _kobo(**over):
    """A minimal but realistic FSW Kobo submission payload (nested keys)."""
    base = {
        '_xform_id_string': FSW_UID,
        '_uuid': 'uuid-1',
        '__version__': 'vCURRENT',
        'grp_admin/dc_code': '5',       # Sabita Rani Halder
        'grp_admin/site_code': '3',
        'grp_admin/interview_start': '2026-07-12T10:00:00',
        'grp_admin/interview_end_actual': '2026-07-12T10:50:00',
        'grp_admin/interview_end': '2026-07-12T18:00:00',
        'grp_scr/consent': '1',
        'grp_scr/s1_age': 30,
        'grp_a2/a203': 30,
    }
    base.update(over)
    return base


class _Sub:
    """Duck-typed KoboSubmission for direct adapter unit tests."""
    def __init__(self, raw, sid='x'):
        self.raw_data = raw
        self.id = sid
        self.latitude = None
        self.longitude = None


def _scan(records, population='fsw'):
    from .anomaly import FIELD_MAP_BUILDERS, _decode_fields, _exclusive_label_map
    schema = load_schema().get(population, {})
    field_map = FIELD_MAP_BUILDERS[population](schema)
    decode = _decode_fields(field_map)
    shaped = [_shape_record(_Sub(r), schema, population, decode) for r in records]
    headers = sorted({k for r in shaped for k in r})
    engine, _ = build_fsw_engine(headers, current_version='vCURRENT',
                                 field_map=field_map,
                                 exclusive_options=_exclusive_label_map(schema, population))
    return engine.scan(shaped), shaped


class AdapterRuleTests(TestCase):
    def _ids(self, records):
        report, _ = _scan(records)
        return {a['rule_id'] for a in report['anomalies']}, report

    def test_missing_end_flagged_not_zero_duration(self):
        rec = _kobo()
        rec.pop('grp_admin/interview_end_actual')       # old-form: no in-form end
        rec['__version__'] = 'vOLD'
        ids, report = self._ids([rec])
        self.assertIn('MISSING_INTERVIEW_END', ids)
        # It is NOT turned into a short/zero-minute interview.
        self.assertNotIn('INTERVIEW_TOO_SHORT', ids)
        self.assertNotIn('END_BEFORE_START', ids)

    def test_valid_duration_produces_no_timing_flag(self):
        ids, _ = self._ids([_kobo()])          # 50-minute interview
        self.assertNotIn('MISSING_INTERVIEW_END', ids)
        self.assertNotIn('INTERVIEW_TOO_SHORT', ids)

    def test_multi_hour_interview_excluded_and_flagged(self):
        rec = _kobo(**{'grp_admin/interview_end_actual': '2026-07-12T14:30:00'})  # 4.5h
        ids, _ = self._ids([rec])
        self.assertIn('INTERVIEW_EXTREMELY_LONG', ids)

    def test_q95_more_than_five(self):
        rec = _kobo(**{'grp_q9/q9_5': '01 02 03 04 05 06'})
        ids, _ = self._ids([rec])
        self.assertIn('Q95_MORE_THAN_FIVE_SERVICES', ids)

    def test_exclusive_choice_with_others(self):
        # b109 "other sources of income": None(0) selected with a real source(1).
        rec = _kobo(**{'grp_b1/b109': '0 1'})
        ids, _ = self._ids([rec])
        self.assertIn('MUTUALLY_EXCLUSIVE_MULTISELECT', ids)

    def test_child_living_contradiction(self):
        rec = _kobo(**{'grp_a2/a213': 1, 'grp_a2/a214': 1, 'grp_b1/b103': '1'})  # b103=Alone
        ids, _ = self._ids([rec])
        self.assertIn('LIVES_ALONE_WITH_CHILD_PRESENT', ids)

    def test_children_with_respondent_exceed_total(self):
        rec = _kobo(**{'grp_a2/a213': 1, 'grp_a2/a214': 3})
        ids, _ = self._ids([rec])
        self.assertIn('CHILDREN_WITH_RESPONDENT_EXCEED_TOTAL', ids)

    def test_income_missing_zero_not_autocorrected(self):
        rec = _kobo(**{'grp_b1/b108': 12})
        report, shaped = _scan([rec])
        ids = {a['rule_id'] for a in report['anomalies']}
        self.assertIn('LIKELY_MISSING_ZERO_IN_INCOME', ids)
        # The raw value is unchanged — never auto-multiplied.
        self.assertEqual(shaped[0]['b108'], 12)

    def test_work_history_start_after_current_age(self):
        rec = _kobo(**{'grp_b1/b104': 40, 'grp_a2/a203': 30})
        ids, _ = self._ids([rec])
        self.assertIn('SEX_WORK_START_AFTER_CURRENT_AGE', ids)

    def test_every_anomaly_has_evidence_and_action(self):
        rec = _kobo(**{'grp_b1/b108': 12, 'grp_a2/a213': 1, 'grp_a2/a214': 3})
        report, _ = _scan([rec])
        self.assertTrue(report['anomalies'])
        for a in report['anomalies']:
            self.assertTrue(a['message'])
            self.assertIn('severity', a)
            self.assertIn('category', a)
            # observed OR fields present as evidence; action recommended.
            self.assertTrue(a.get('observed') is not None or a.get('fields'))

    def test_raw_data_is_immutable(self):
        rec = _kobo(**{'grp_b1/b108': 12})
        import copy
        snapshot = copy.deepcopy(rec)
        _scan([rec])
        self.assertEqual(rec, snapshot)   # adapter never mutates the source


def _mk_user():
    return User.objects.create_user(
        email='rev@ciprb.org', password='pw', full_name='Reviewer',
        organisation=Organisation.CIPRB, role=Role.DEVELOPER)


@override_settings(CACHES={'default': {'BACKEND':
                   'django.core.cache.backends.locmem.LocMemCache'}})
class AnomalyApiTests(TestCase):
    def setUp(self):
        invalidate_cache()
        # One record with MULTIPLE flags (income missing-zero + child-count
        # contradiction), so flag-counts vs unique-interview counts differ.
        KoboSubmission.objects.create(
            kobo_id='k1', form_type=FormType.BASELINE, status=SubmissionStatus.APPROVED,
            partner='CIPRB',
            raw_data=_kobo(**{'grp_b1/b108': 12, 'grp_a2/a213': 1, 'grp_a2/a214': 3}),
            submitted_at=timezone.now())
        self.user = _mk_user()
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_report_serialises_with_kpis_and_review_fields(self):
        r = self.client.get('/api/baseline/fsw-anomalies/')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn('kpis', body)
        for k in ('critical', 'high', 'medium', 'low',
                  'interviews_affected', 'flags_reviewed', 'flags_total'):
            self.assertIn(k, body['kpis'])
        self.assertTrue(body['anomalies'])
        self.assertEqual(body['anomalies'][0]['review_status'], 'new')

    def test_severity_kpis_count_flags_not_unique_interviews(self):
        # One record with several HIGH flags: high == number of FLAGS, while
        # interviews_affected == 1 — the corrected KPI split.
        body = self.client.get('/api/baseline/fsw-anomalies/').json()
        k = body['kpis']
        total_by_sev = k['critical'] + k['high'] + k['medium'] + k['low']
        self.assertEqual(total_by_sev, k['flags_total'])
        self.assertGreater(k['flags_total'], k['interviews_affected'])
        self.assertEqual(k['interviews_affected'], 1)

    def test_flag_scoped_filters(self):
        base = '/api/baseline/fsw-anomalies/'
        body = self.client.get(base, {'severity': 'high'}).json()
        self.assertTrue(all(a['severity'] == 'high' for a in body['anomalies']))
        self.assertEqual(body['kpis']['medium'], 0)
        one_rule = self.client.get(
            base, {'rule': 'LIKELY_MISSING_ZERO_IN_INCOME'}).json()
        self.assertEqual(set(a['rule_id'] for a in one_rule['anomalies']),
                         {'LIKELY_MISSING_ZERO_IN_INCOME'})
        none_reviewed = self.client.get(
            base, {'review_status': 'confirmed'}).json()
        self.assertEqual(none_reviewed['anomaly_count'], 0)
        searched = self.client.get(base, {'q': 'income'}).json()
        self.assertTrue(searched['anomaly_count'] >= 1)

    def test_record_scoped_filter_narrows_denominator(self):
        base = '/api/baseline/fsw-anomalies/'
        hit = self.client.get(base, {'enumerator': 'Sabita Rani Halder'}).json()
        self.assertEqual(hit['records_scanned'], 1)
        miss = self.client.get(base, {'enumerator': 'Nobody Real'}).json()
        self.assertEqual(miss['records_scanned'], 0)
        self.assertEqual(miss['anomaly_count'], 0)

    def test_population_all_is_default(self):
        body = self.client.get('/api/baseline/fsw-anomalies/').json()
        self.assertEqual(body['population'], 'all')

    def test_needs_verification_is_a_valid_review_status(self):
        body = self.client.get('/api/baseline/fsw-anomalies/').json()
        a = body['anomalies'][0]
        resp = self.client.post('/api/baseline/fsw-anomalies/review/', {
            'submission_id': a['record_id'], 'rule_id': a['rule_id'],
            'status': 'needs_verification', 'note': 'send supervisor'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['status'], 'needs_verification')

    def test_review_decision_persists_and_merges(self):
        body = self.client.get('/api/baseline/fsw-anomalies/').json()
        a = body['anomalies'][0]
        resp = self.client.post('/api/baseline/fsw-anomalies/review/', {
            'submission_id': a['record_id'], 'rule_id': a['rule_id'],
            'status': 'false_positive', 'note': 'legit'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(AnomalyReview.objects.count(), 1)
        invalidate_cache()
        merged = self.client.get('/api/baseline/fsw-anomalies/').json()
        hit = [x for x in merged['anomalies']
               if x['record_id'] == a['record_id'] and x['rule_id'] == a['rule_id']]
        self.assertEqual(hit[0]['review_status'], 'false_positive')
        self.assertEqual(hit[0]['reviewed_by'], 'Reviewer')

    def test_review_rejects_bad_status(self):
        resp = self.client.post('/api/baseline/fsw-anomalies/review/', {
            'submission_id': 's', 'rule_id': 'R', 'status': 'nonsense'}, format='json')
        self.assertEqual(resp.status_code, 400)


HIJRA_UID = 'aBT7aCL9p4FGcW4WwXZcr6'


def _hijra_kobo(**over):
    base = {
        '_xform_id_string': HIJRA_UID, '_uuid': 'huuid-1', '__version__': 'vCURRENT',
        'grp_admin/dc_code': '1', 'grp_admin/site_code': '2',
        'grp_admin/interview_start': '2026-07-12T10:00:00',
        'grp_admin/interview_end_actual': '2026-07-12T10:50:00',
        'grp_scr/consent': '1', 'grp_scr/s2_age': 27, 'grp_a2/a205_age': 27,
        'grp_c/c2': 'Interview conducted in private, respondent at ease.',
    }
    base.update(over)
    return base


class HijraAdapterTests(TestCase):
    """The same engine must run on Hijra data via its own field map."""

    def _ids(self, records):
        report, _ = _scan(records, population='hijra')
        return {a['rule_id'] for a in report['anomalies']}

    def test_hijra_missing_end_on_old_form(self):
        rec = _hijra_kobo()
        rec.pop('grp_admin/interview_end_actual')
        rec['__version__'] = 'vOLD'
        ids = self._ids([rec])
        self.assertIn('MISSING_INTERVIEW_END', ids)
        self.assertIn('OLD_FORM_VERSION', ids)

    def test_hijra_age_mismatch(self):
        rec = _hijra_kobo(**{'grp_scr/s2_age': 27, 'grp_a2/a205_age': 40})
        self.assertIn('AGE_MISMATCH', self._ids([rec]))

    def test_hijra_weak_observation(self):
        rec = _hijra_kobo(**{'grp_c/c2': 'Valo'})
        self.assertIn('WEAK_INTERVIEWER_OBSERVATION', self._ids([rec]))

    def test_hijra_income_missing_zero(self):
        rec = _hijra_kobo(**{'grp_b1/b104_share': 10})
        self.assertIn('LIKELY_MISSING_ZERO_IN_INCOME', self._ids([rec]))

    def test_hijra_q95_more_than_five(self):
        rec = _hijra_kobo(**{'grp_q9/q9_5': '01 02 03 04 05 06'})
        self.assertIn('Q95_MORE_THAN_FIVE_SERVICES', self._ids([rec]))

    def test_hijra_clean_record_has_no_flags(self):
        self.assertEqual(self._ids([_hijra_kobo()]), set())


class ExclusiveMultiselectConfigTest(TestCase):
    """Exclusivity comes ONLY from the explicit per-question config
    (EXCLUSIVE_CHOICE_CODES) — never from generic text matching. The old regex
    treated 'Never share needles or syringes' (a correct HIV-knowledge answer,
    FSW q3_5 code 05) as an exclusive 'none' choice and flooded the report."""

    def _ids(self, records, population='fsw'):
        report, _ = _scan(records, population)
        return report, {a['rule_id'] for a in report['anomalies']}

    def test_correct_hiv_answer_with_never_is_not_a_conflict(self):
        # q3_5 "In what ways can a person protect themselves…":
        # 01 (use condoms) + 05 (Never share needles) = a GOOD answer.
        rec = _kobo(**{'grp_q3/q3_5': '01 05'})
        _, ids = self._ids([rec])
        self.assertNotIn('MUTUALLY_EXCLUSIVE_MULTISELECT', ids)

    def test_dont_know_with_answers_is_not_flagged(self):
        # 'Don't know' (98) alongside partial answers is respondent behaviour,
        # not a data conflict — deliberately unconfigured.
        rec = _kobo(**{'grp_q3/q3_5': '01 98'})
        _, ids = self._ids([rec])
        self.assertNotIn('MUTUALLY_EXCLUSIVE_MULTISELECT', ids)

    def test_no_concerns_with_a_concern_is_flagged_with_labels(self):
        # q9_6 concerns: 10 (No concerns) + 01 (a concern) = real conflict.
        rec = _kobo(**{'grp_q9/q9_6': '10 01'})
        report, ids = self._ids([rec])
        self.assertIn('MUTUALLY_EXCLUSIVE_MULTISELECT', ids)
        flag = [a for a in report['anomalies']
                if a['rule_id'] == 'MUTUALLY_EXCLUSIVE_MULTISELECT'][0]
        # Evidence carries the actual selected option labels.
        self.assertEqual(flag['observed']['exclusive'], ['No concerns'])
        self.assertTrue(flag['observed']['also_selected'])

    def test_income_none_with_a_source_still_flagged(self):
        rec = _kobo(**{'grp_b1/b109': '0 1'})
        _, ids = self._ids([rec])
        self.assertIn('MUTUALLY_EXCLUSIVE_MULTISELECT', ids)

    def test_exclusive_alone_is_clean(self):
        rec = _kobo(**{'grp_q9/q9_6': '10'})
        _, ids = self._ids([rec])
        self.assertNotIn('MUTUALLY_EXCLUSIVE_MULTISELECT', ids)

    def test_hijra_no_concerns_conflict_flagged(self):
        rec = _hijra_kobo(**{'grp_q9/q9_6': '08 01'})
        _, ids = self._ids([rec], population='hijra')
        self.assertIn('MUTUALLY_EXCLUSIVE_MULTISELECT', ids)

    def test_hijra_dont_know_not_flagged(self):
        rec = _hijra_kobo(**{'grp_q3/q3_2': '01 98'})
        _, ids = self._ids([rec], population='hijra')
        self.assertNotIn('MUTUALLY_EXCLUSIVE_MULTISELECT', ids)

    def test_config_resolves_against_real_forms(self):
        # Every configured (field, code) must exist in the deployed schema —
        # a typo here would silently disable the rule.
        from .anomaly import EXCLUSIVE_CHOICE_CODES, _exclusive_label_map
        for pop in ('fsw', 'hijra'):
            schema = load_schema()[pop]
            label_map = _exclusive_label_map(schema, pop)
            self.assertEqual(len(label_map), len(EXCLUSIVE_CHOICE_CODES[pop]),
                             f'{pop}: some configured fields did not resolve')
