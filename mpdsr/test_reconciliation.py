"""Read-path contract for the CIPRB reconciliation health strip.

The heavy part of reconciliation — replaying live Kobo payloads and counting how
many rows the handlers must create — is verified against the real DB on Railway
(mpdsr/reconcile.py, `manage.py reconcile_ciprb`). What runs anywhere, and what
the dashboard depends on every page load, is the READ path:

  - the endpoint returns a truthful "not run yet" shape when there is no
    snapshot (it must NOT imply health),
  - it returns the NEWEST snapshot when several exist,
  - it is gated so only CIPRB-dashboard viewers can read it.

These tests lock that contract so a refactor can't silently turn "unknown" into
"all good" — the exact failure mode this whole guard exists to prevent.
"""
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from accounts.models import Organisation, Role, User
from mpdsr.models import CIPRBReconSnapshot

URL = '/api/mpdsr/reconciliation/'


def _snapshot(run_at, *, stranded=0, crashes=0, all_ok=True, forms=None):
    return CIPRBReconSnapshot.objects.create(
        run_at=run_at,
        data={
            'forms': forms if forms is not None else [],
            'total_stranded': stranded,
            'total_crashes': crashes,
            'all_ok': all_ok,
        },
    )


class ReconciliationReadPathTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ciprb = User.objects.create_user(
            email='recon@ciprb.org', password='p', full_name='Recon',
            organisation=Organisation.CIPRB, role=Role.ORG_LEAD)

    def test_no_snapshot_is_reported_as_unavailable_not_healthy(self):
        self.client.force_authenticate(self.ciprb)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        # The critical invariant: absence of data must never read as health.
        self.assertFalse(body['available'])
        self.assertFalse(body.get('all_ok', False))
        self.assertEqual(body['forms'], [])

    def test_returns_newest_snapshot_when_several_exist(self):
        now = timezone.now()
        _snapshot(now - timedelta(hours=2), stranded=9, all_ok=False)
        _snapshot(now - timedelta(hours=1), stranded=3, all_ok=False)
        newest = _snapshot(now, stranded=0, all_ok=True, forms=[
            {'slug': 'ciprb_near_miss_v1', 'kobo_count': 5, 'app_rows': 5,
             'stranded': 0, 'crashes': 0, 'hook_active': True},
        ])

        self.client.force_authenticate(self.ciprb)
        body = self.client.get(URL).json()
        self.assertTrue(body['available'])
        self.assertEqual(body['run_at'], newest.run_at.isoformat())
        self.assertEqual(body['total_stranded'], 0)
        self.assertTrue(body['all_ok'])
        self.assertEqual(len(body['forms']), 1)

    def test_drift_snapshot_surfaces_the_affected_form(self):
        _snapshot(timezone.now(), stranded=4, crashes=1, all_ok=False, forms=[
            {'slug': 'ciprb_mpdsr_community_maternal_v1', 'kobo_count': 20,
             'app_rows': 16, 'stranded': 4, 'crashes': 1, 'hook_active': True},
        ])
        self.client.force_authenticate(self.ciprb)
        body = self.client.get(URL).json()
        self.assertTrue(body['available'])
        self.assertEqual(body['total_stranded'], 4)
        self.assertEqual(body['total_crashes'], 1)
        self.assertEqual(body['forms'][0]['slug'],
                         'ciprb_mpdsr_community_maternal_v1')

    def test_unauthenticated_is_denied(self):
        res = self.client.get(URL)
        self.assertIn(res.status_code, (401, 403))

    def test_non_ciprb_manager_is_denied(self):
        phd = User.objects.create_user(
            email='m@phd.org', password='p', full_name='PHD Mgr',
            organisation=Organisation.PHD, role=Role.MANAGER)
        self.client.force_authenticate(phd)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 403)
