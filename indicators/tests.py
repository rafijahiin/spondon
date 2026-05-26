"""
Tests for the restructured IndicatorTarget API + Target Config permissions.

The 44-row seed is loaded by migration 0004; these tests rely on it.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Organisation, Role, User
from indicators.models import IndicatorTarget

TARGETS_URL = '/api/indicators/targets/'


def _user(email, org, role):
    return User.objects.create_user(
        email=email, password='x', full_name='T',
        organisation=org, role=role,
    )


class SeedShapeTest(TestCase):
    """The migration-loaded fixture should produce 44 rows with the
    correct partner split and the correct null-target counts."""

    def test_total_rows(self):
        self.assertEqual(IndicatorTarget.objects.count(), 44)

    def test_partner_counts(self):
        self.assertEqual(IndicatorTarget.objects.filter(partner__code='PHD').count(), 22)
        self.assertEqual(IndicatorTarget.objects.filter(partner__code='Bandhu').count(), 19)
        self.assertEqual(IndicatorTarget.objects.filter(partner__code='CIPRB').count(), 3)

    def test_phd_overall_row_obj_zero(self):
        row = IndicatorTarget.objects.get(partner__code='PHD', activity_code='OVERALL')
        self.assertEqual(row.objective_number, 0)
        self.assertEqual(row.target_value, Decimal('11.00'))
        self.assertIn('Brothels covered', row.activity_label)

    def test_bandhu_no_objective_3(self):
        objs = set(
            IndicatorTarget.objects
            .filter(partner__code='Bandhu')
            .values_list('objective_number', flat=True)
        )
        self.assertEqual(objs, {1, 2, 4})

    def test_ciprb_targets_all_null(self):
        rows = IndicatorTarget.objects.filter(partner__code='CIPRB')
        self.assertEqual(rows.count(), 3)
        self.assertEqual(rows.filter(target_value__isnull=True).count(), 3)


class IndicatorTargetReadTest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.sup = _user('s@unfpa', Organisation.UNFPA, Role.SUPERVISOR)
        self.phd_lead = _user('lead@phd', Organisation.PHD, Role.ORG_LEAD)
        self.bandhu_mgr = _user('mgr@bandhu', Organisation.BANDHU, Role.MANAGER)

    def _rows(self, r):
        if isinstance(r.data, dict) and 'results' in r.data:
            return r.data['results']
        return r.data

    def test_supervisor_sees_all_44(self):
        self.client.force_authenticate(user=self.sup)
        r = self.client.get(TARGETS_URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(self._rows(r)), 44)

    def test_org_lead_reads_all_partners(self):
        # ORG_LEAD has can_read_other_orgs=True — read isn't restricted,
        # only writes are scoped to own partner (covered in write tests).
        self.client.force_authenticate(user=self.phd_lead)
        r = self.client.get(TARGETS_URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(self._rows(r)), 44)

    def test_manager_only_sees_own_partner(self):
        self.client.force_authenticate(user=self.bandhu_mgr)
        r = self.client.get(TARGETS_URL)
        self.assertEqual(r.status_code, 200)
        codes = {row['partner_code'] for row in self._rows(r)}
        self.assertEqual(codes, {'Bandhu'})


class IndicatorTargetWritePermissionTest(TestCase):
    """CanConfigureTargets — Dev/Supervisor for any partner, Org Lead for
    own partner only, everyone else blocked."""

    def setUp(self):
        self.client = APIClient()
        self.sup = _user('s@unfpa', Organisation.UNFPA, Role.SUPERVISOR)
        self.ciprb_lead = _user('lead@ciprb', Organisation.CIPRB, Role.ORG_LEAD)
        self.phd_lead = _user('lead@phd', Organisation.PHD, Role.ORG_LEAD)
        self.bandhu_mgr = _user('mgr@bandhu', Organisation.BANDHU, Role.MANAGER)

        self.phd_row   = IndicatorTarget.objects.filter(partner__code='PHD').first()
        self.ciprb_row = IndicatorTarget.objects.filter(partner__code='CIPRB').first()

    def _patch(self, row_id, target_value):
        return self.client.patch(
            f'{TARGETS_URL}{row_id}/',
            {'target_value': target_value},
            format='json',
        )

    def test_supervisor_can_edit_any_partner(self):
        self.client.force_authenticate(user=self.sup)
        r = self._patch(self.phd_row.id, 9999)
        self.assertEqual(r.status_code, 200)
        self.phd_row.refresh_from_db()
        self.assertEqual(self.phd_row.target_value, Decimal('9999.00'))
        self.assertEqual(self.phd_row.updated_by, self.sup)

    def test_ciprb_lead_can_edit_ciprb_target(self):
        self.client.force_authenticate(user=self.ciprb_lead)
        r = self._patch(self.ciprb_row.id, 25)
        self.assertEqual(r.status_code, 200)

    def test_phd_lead_cannot_edit_ciprb_target(self):
        self.client.force_authenticate(user=self.phd_lead)
        r = self._patch(self.ciprb_row.id, 25)
        self.assertEqual(r.status_code, 403)

    def test_manager_cannot_edit_target(self):
        self.client.force_authenticate(user=self.bandhu_mgr)
        row = IndicatorTarget.objects.filter(partner__code='Bandhu').first()
        r = self._patch(row.id, 100)
        self.assertEqual(r.status_code, 403)


# ─── Step 3: service-layer compute wiring ────────────────────────────────────

from datetime import date

from indicators import bandhu, phd
from indicators.service import (
    get_partner_indicator_progress,
    get_indicator_progress,
)

P_START = date(2026, 5, 21)
P_END   = date(2026, 11, 20)


class ActivityRegistryShapeTest(TestCase):
    """Both partner registries must cover every fixture row that has a
    'real' (i.e. not deliberately unlinked) module, and no others."""

    def test_phd_unlinked_codes_are_3_1x(self):
        codes_in_fixture = set(
            IndicatorTarget.objects
            .filter(partner__code='PHD', is_active=True)
            .values_list('activity_code', flat=True)
        )
        unlinked = codes_in_fixture - set(phd.ACTIVITY_REGISTRY)
        # Step 3 spec: IEC materials (3.1a–d) is the only deliberately
        # unlinked group on PHD.
        self.assertEqual(unlinked, {'3.1a', '3.1b', '3.1c', '3.1d'})

    def test_bandhu_unlinked_codes_are_2_6_and_4_3(self):
        codes_in_fixture = set(
            IndicatorTarget.objects
            .filter(partner__code='Bandhu', is_active=True)
            .values_list('activity_code', flat=True)
        )
        unlinked = codes_in_fixture - set(bandhu.ACTIVITY_REGISTRY)
        # 2.6 = day observance events, 4.3 = e-billboards — both pending.
        self.assertEqual(unlinked, {'2.6', '4.3'})

    def test_phd_overall_is_registered(self):
        self.assertIn('OVERALL', phd.ACTIVITY_REGISTRY)
        self.assertIn('OVERALL', phd.ORG_ONLY_CODES)


class PartnerProgressShapeTest(TestCase):
    """get_partner_indicator_progress emits the Step 3 dict shape with
    achievement=0 / percentage rules / unlinked flag."""

    def test_phd_returns_22_rows(self):
        rows = get_partner_indicator_progress('PHD', P_START, P_END)
        self.assertEqual(len(rows), 22)

    def test_bandhu_returns_19_rows(self):
        rows = get_partner_indicator_progress('Bandhu', P_START, P_END)
        self.assertEqual(len(rows), 19)

    def test_ciprb_returns_3_rows_all_unlinked(self):
        rows = get_partner_indicator_progress('CIPRB', P_START, P_END)
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(r['unlinked'] for r in rows))

    def test_every_row_has_step3_keys(self):
        rows = get_partner_indicator_progress('PHD', P_START, P_END)
        required = {
            'activity_code', 'objective_number', 'activity_label',
            'indicator_label', 'target_value', 'unit',
            'achievement', 'percentage', 'unlinked',
        }
        for r in rows:
            self.assertTrue(required.issubset(r.keys()), msg=f'row={r}')

    def test_achievement_is_zero_not_none_with_no_records(self):
        # No fixtures, no Kobo submissions → every linked row should
        # return achievement=0 (never None).
        for org in ('PHD', 'Bandhu'):
            for r in get_partner_indicator_progress(org, P_START, P_END):
                self.assertIsNotNone(r['achievement'], msg=f'{org}/{r["activity_code"]}')
                self.assertEqual(r['achievement'], 0)

    def test_percentage_null_when_target_null(self):
        # CIPRB rows all have target_value=None → percentage must be None.
        for r in get_partner_indicator_progress('CIPRB', P_START, P_END):
            self.assertIsNone(r['target_value'])
            self.assertIsNone(r['percentage'])

    def test_percentage_zero_when_target_positive_and_achievement_zero(self):
        # PHD rows have positive targets and achievement=0 (no records);
        # percentage must be 0.0, not None.
        rows = [
            r for r in get_partner_indicator_progress('PHD', P_START, P_END)
            if r['target_value'] is not None and not r['unlinked']
        ]
        self.assertTrue(rows, 'expected at least one linked PHD row with a target')
        for r in rows:
            self.assertEqual(
                r['percentage'], 0.0,
                msg=f"{r['activity_code']} achievement={r['achievement']} target={r['target_value']}",
            )

    def test_unlinked_rows_still_present_and_not_crashing(self):
        # PHD 3.1a–d must appear with unlinked=True, achievement=0.
        rows = {r['activity_code']: r for r in get_partner_indicator_progress('PHD', P_START, P_END)}
        for code in ('3.1a', '3.1b', '3.1c', '3.1d'):
            self.assertIn(code, rows)
            self.assertTrue(rows[code]['unlinked'])
            self.assertEqual(rows[code]['achievement'], 0)

    def test_phd_overall_row_ordered_first(self):
        rows = get_partner_indicator_progress('PHD', P_START, P_END)
        self.assertEqual(rows[0]['activity_code'], 'OVERALL')
        self.assertEqual(rows[0]['objective_number'], 0)
        # No PHD ServiceCenters exist in the test DB → achievement should
        # be 0, not None or crash.
        self.assertEqual(rows[0]['achievement'], 0)
        self.assertFalse(rows[0]['unlinked'])

    def test_bandhu_objective_order_skips_3(self):
        rows = get_partner_indicator_progress('Bandhu', P_START, P_END)
        objs = [r['objective_number'] for r in rows]
        # Must be sorted and contain 1, 2, 4 — never 3.
        self.assertEqual(sorted(set(objs)), [1, 2, 4])
        self.assertEqual(objs, sorted(objs))


class SingleIndicatorProgressTest(TestCase):
    """get_indicator_progress returns the same row shape for a single
    (partner, code) pair, and degrades gracefully on unknown codes."""

    def test_known_code_returns_row(self):
        r = get_indicator_progress('PHD', '1.1', P_START, P_END)
        self.assertEqual(r['activity_code'], '1.1')
        self.assertEqual(r['achievement'], 0)
        self.assertFalse(r['unlinked'])

    def test_unlinked_code_returns_row_with_flag(self):
        r = get_indicator_progress('PHD', '3.1c', P_START, P_END)
        self.assertTrue(r['unlinked'])
        self.assertEqual(r['achievement'], 0)

    def test_unknown_code_does_not_crash(self):
        r = get_indicator_progress('PHD', 'BOGUS', P_START, P_END)
        self.assertEqual(r['achievement'], 0)
        self.assertTrue(r['unlinked'])
        self.assertIsNone(r['target_value'])


class ProgressEndpointTest(TestCase):
    """The /api/indicators/progress/ endpoint surfaces the Step 3 shape
    through the IndicatorProgressSerializer."""

    def setUp(self):
        self.client = APIClient()
        self.sup = _user('s@unfpa', Organisation.UNFPA, Role.SUPERVISOR)
        self.client.force_authenticate(user=self.sup)

    def test_progress_endpoint_returns_step3_shape(self):
        r = self.client.get(
            '/api/indicators/progress/?org=PHD'
            '&period_start=2026-05-21&period_end=2026-11-20'
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 22)
        first = r.data[0]
        for key in ('activity_code', 'objective_number', 'achievement',
                    'percentage', 'unlinked', 'target_value'):
            self.assertIn(key, first)

    def test_all_orgs_endpoint_includes_ciprb(self):
        r = self.client.get(
            '/api/indicators/progress/'
            '?period_start=2026-05-21&period_end=2026-11-20'
        )
        self.assertEqual(r.status_code, 200)
        # Supervisor with no ?org param ⇒ all three partners merged.
        orgs = {row['organisation'] for row in r.data}
        self.assertEqual(orgs, {'CIPRB', 'Bandhu', 'PHD'})
        self.assertEqual(len(r.data), 44)
