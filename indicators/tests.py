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
