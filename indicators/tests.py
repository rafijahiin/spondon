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

    def test_phd_all_codes_wired(self):
        """After the IECMaterial compute landed (Commit 2 model + migration
        0006 wiring), every PHD fixture code has a compute function.
        Replaces the old test that asserted 3.1a-d were unlinked."""
        codes_in_fixture = set(
            IndicatorTarget.objects
            .filter(partner__code='PHD', is_active=True)
            .values_list('activity_code', flat=True)
        )
        unlinked = codes_in_fixture - set(phd.ACTIVITY_REGISTRY)
        self.assertEqual(unlinked, set())

    def test_bandhu_all_codes_wired(self):
        """After DAY_OBSERVANCE (Commit 1) + IECMaterial (Commit 2) +
        migration 0006, every Bandhu fixture code resolves to a compute
        function. 2.6 (day observance) and 4.3 (e-billboards) used to
        be unlinked; both are now live."""
        codes_in_fixture = set(
            IndicatorTarget.objects
            .filter(partner__code='Bandhu', is_active=True)
            .values_list('activity_code', flat=True)
        )
        unlinked = codes_in_fixture - set(bandhu.ACTIVITY_REGISTRY)
        self.assertEqual(unlinked, set())

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

    def test_ciprb_returns_3_rows_all_linked(self):
        # Migration 0007 + indicators.ciprb wired all 3 CIPRB rows
        # (F.C, F.Camp, B) to fistula and baseline backings.
        rows = get_partner_indicator_progress('CIPRB', P_START, P_END)
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(not r['unlinked'] for r in rows))

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

    def test_iec_rows_now_linked_and_returning_zero(self):
        # PHD 3.1a–d used to be unlinked. Migration 0006 + the IECMaterial
        # compute functions wire them; with no IECMaterial rows in the
        # test DB they correctly return achievement=0 and unlinked=False.
        rows = {r['activity_code']: r for r in get_partner_indicator_progress('PHD', P_START, P_END)}
        for code in ('3.1a', '3.1b', '3.1c', '3.1d'):
            self.assertIn(code, rows)
            self.assertFalse(rows[code]['unlinked'])
            self.assertEqual(rows[code]['achievement'], 0)

    def test_ciprb_rows_now_linked_and_returning_zero(self):
        # CIPRB compute functions (indicators.ciprb) wire all 3 rows.
        # With no FistulaCornerCase / FistulaCampaignVisit / BaselineSurvey
        # in the test DB they correctly return achievement=0 and
        # unlinked=False (linked, just no data yet).
        rows = {r['activity_code']: r for r in get_partner_indicator_progress('CIPRB', P_START, P_END)}
        for code in ('F.C', 'F.Camp', 'B'):
            self.assertIn(code, rows)
            self.assertFalse(rows[code]['unlinked'])
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

    def test_ciprb_fistula_corner_now_linked(self):
        # F.C wired to FistulaCornerCase by migration 0007. No fixture
        # rows in test DB so achievement is 0, but the row is linked.
        r = get_indicator_progress('CIPRB', 'F.C', P_START, P_END)
        self.assertFalse(r['unlinked'])
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


# ─── KoboFormMapping wiring (migration 0006) ─────────────────────────────────

class KoboFormMappingWiringTest(TestCase):
    """Verifies migration 0006 seeded the form catalogue and wired the
    IndicatorTarget.source_form FK for every activity that has a Kobo form
    backing it. Reference-table-driven indicators correctly stay NULL."""

    def test_21_form_mappings_seeded(self):
        from indicators.models import KoboFormMapping
        # 17 generated programs forms (migration 0006)
        # + spondon_iec_material_v1 (0006)
        # + spondon_fistula_corner_v1 + spondon_fistula_campaign_v1 (0007)
        # + spondon_baseline_v1 (0007 — added retroactively for CIPRB B wiring)
        # = 21 total.
        self.assertEqual(KoboFormMapping.objects.count(), 21)
        slugs = set(KoboFormMapping.objects.values_list('form_slug', flat=True))
        self.assertIn('spondon_clinic_visit_v1', slugs)
        self.assertIn('spondon_iec_material_v1', slugs)
        self.assertIn('spondon_fistula_corner_v1', slugs)
        self.assertIn('spondon_fistula_campaign_v1', slugs)

    def test_partner_exclusive_forms_have_partner_fk(self):
        from indicators.models import KoboFormMapping
        self.assertEqual(
            KoboFormMapping.objects.get(form_slug='spondon_hygiene_kit_v1').partner.code,
            'Bandhu',
        )
        self.assertEqual(
            KoboFormMapping.objects.get(form_slug='spondon_autoclave_log_v1').partner.code,
            'PHD',
        )
        self.assertEqual(
            KoboFormMapping.objects.get(form_slug='spondon_antenatal_card_v1').partner.code,
            'PHD',
        )

    def test_cross_partner_forms_have_null_partner(self):
        from indicators.models import KoboFormMapping
        self.assertIsNone(
            KoboFormMapping.objects.get(form_slug='spondon_clinic_visit_v1').partner,
        )
        self.assertIsNone(
            KoboFormMapping.objects.get(form_slug='spondon_coord_meeting_v1').partner,
        )

    def test_phd_indicators_source_form_wired(self):
        row = IndicatorTarget.objects.get(partner__code='PHD', activity_code='1.1')
        self.assertEqual(row.source_form.form_slug, 'spondon_clinic_visit_v1')

        row = IndicatorTarget.objects.get(partner__code='PHD', activity_code='3.1a')
        self.assertEqual(row.source_form.form_slug, 'spondon_iec_material_v1')

    def test_bandhu_indicators_source_form_wired(self):
        row = IndicatorTarget.objects.get(partner__code='Bandhu', activity_code='2.6')
        self.assertEqual(row.source_form.form_slug, 'spondon_coord_meeting_v1')

        row = IndicatorTarget.objects.get(partner__code='Bandhu', activity_code='4.3')
        self.assertEqual(row.source_form.form_slug, 'spondon_iec_material_v1')

    def test_reference_table_indicators_remain_null(self):
        # ServiceCenter-driven rows must not be wired to a Kobo form.
        for partner, code in [
            ('PHD',    'OVERALL'),
            ('PHD',    '1.7'),       # ServiceCenter count
            ('PHD',    '1.5b'),      # StockEntry
            ('PHD',    '1.5e'),
            ('Bandhu', '1.5a'),      # ServiceCenter
            ('Bandhu', '1.6'),       # Dhaka KP clinic registry
            ('Bandhu', '1.8'),       # DICs registry
        ]:
            row = IndicatorTarget.objects.get(partner__code=partner, activity_code=code)
            self.assertIsNone(row.source_form,
                              msg=f'{partner}/{code} should have source_form=NULL')

    def test_ciprb_indicators_wired_to_fistula_and_baseline(self):
        # Migration 0007 wired all 3 CIPRB rows after the Fistula register
        # photo + Sunamganj campaign xlsx confirmed the schema.
        expected = {
            'F.C':    'spondon_fistula_corner_v1',
            'F.Camp': 'spondon_fistula_campaign_v1',
            'B':      'spondon_baseline_v1',
        }
        for code, slug in expected.items():
            row = IndicatorTarget.objects.get(partner__code='CIPRB', activity_code=code)
            self.assertIsNotNone(row.source_form, msg=f'CIPRB/{code} should be wired')
            self.assertEqual(row.source_form.form_slug, slug,
                             msg=f'CIPRB/{code} wrong source_form')


# ─── New compute functions (Commit 2 IEC + day-observance) ───────────────────

class NewComputeFunctionsTest(TestCase):
    """compute_I_BND_2_6 + compute_I_PHD_3_1A-D + compute_I_BND_4_1 / 4_3
    were unwired before migration 0006. These tests exercise them with
    minimal fixtures and assert non-crash + correct count from the new
    IECMaterial and CoordMeeting (DAY_OBSERVANCE) backings."""

    def setUp(self):
        from programs.models import ServiceCenter
        self.phd_center = ServiceCenter.objects.create(
            organisation='PHD', name='C-IECTEST', code='IECTEST-1',
            center_type=ServiceCenter.BROTHEL, district='Dhaka',
        )

    def test_phd_3_1a_counts_message_boards(self):
        from programs.models import IECMaterial
        from partners.models import Partner
        from indicators.phd import compute_I_PHD_3_1A
        from datetime import date
        partner = Partner.objects.get(code='PHD')
        IECMaterial.objects.create(
            partner=partner, center=self.phd_center, organisation='PHD',
            material_type=IECMaterial.MESSAGE_BOARD,
            quantity=10, date_distributed=date(2026, 6, 1),
            approval_status=IECMaterial.APPROVED,
        )
        IECMaterial.objects.create(
            partner=partner, center=self.phd_center, organisation='PHD',
            material_type=IECMaterial.POSTER,   # different type
            quantity=99, date_distributed=date(2026, 6, 1),
            approval_status=IECMaterial.APPROVED,
        )
        result = compute_I_PHD_3_1A('PHD', date(2026, 5, 21), date(2026, 11, 20))
        self.assertEqual(result, 10)

    def test_bandhu_2_6_counts_day_observance(self):
        from programs.models import CoordMeeting
        from indicators.bandhu import compute_I_BND_2_6
        from datetime import date
        CoordMeeting.objects.create(
            organisation='Bandhu',
            meeting_date=date(2026, 6, 1),
            meeting_type=CoordMeeting.DAY_OBSERVANCE,
            meeting_notes='dummy.pdf',  # blank=False on the field
            approval_status=CoordMeeting.APPROVED,
        )
        CoordMeeting.objects.create(
            organisation='Bandhu',
            meeting_date=date(2026, 6, 2),
            meeting_type=CoordMeeting.GOB,  # different type
            meeting_notes='dummy.pdf',
            approval_status=CoordMeeting.APPROVED,
        )
        result = compute_I_BND_2_6('Bandhu', date(2026, 5, 21), date(2026, 11, 20))
        self.assertEqual(result, 1)

    def test_bandhu_4_3_counts_digital_iec(self):
        from programs.models import IECMaterial
        from partners.models import Partner
        from indicators.bandhu import compute_I_BND_4_3
        from datetime import date
        partner = Partner.objects.get(code='Bandhu')
        IECMaterial.objects.create(
            partner=partner, organisation='Bandhu',
            material_type=IECMaterial.DIGITAL,
            quantity=1, date_distributed=date(2026, 6, 1),
            approval_status=IECMaterial.APPROVED,
        )
        IECMaterial.objects.create(
            partner=partner, organisation='Bandhu',
            material_type=IECMaterial.DIGITAL,
            quantity=1, date_distributed=date(2026, 7, 1),
            approval_status=IECMaterial.APPROVED,
        )
        result = compute_I_BND_4_3('Bandhu', date(2026, 5, 21), date(2026, 11, 20))
        self.assertEqual(result, 2)  # count of installations, not sum(quantity)
