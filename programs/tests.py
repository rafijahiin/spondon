"""
Org-isolation smoke test — confirms that every programs ViewSet correctly
restricts manager visibility to their own organisation.

Pattern: create one row per organisation, log in as a manager, assert the
LIST endpoint returns exactly one row whose organisation matches them.
A super admin login asserts both rows are returned.

Covered endpoints (one per ViewSet base class):
  - /api/programs/centers/         (ServiceCenter — direct ModelViewSet)
  - /api/programs/clients/         (Client          — direct ModelViewSet)
  - /api/programs/clinic-visits/   (ClinicVisit     — OrgFilteredViewSet
                                   with own get_queryset override)
  - /api/programs/outreach-sessions/ (OutreachSession — plain
                                     OrgFilteredViewSet inheritance)
  - /api/programs/stock-entries/   (StockEntry      — OrgFilteredViewSet
                                   with own get_queryset override)
  - /api/programs/visitor-register/ (VisitorRegister — direct ModelViewSet)
  - /api/programs/pending-approvals/ (aggregated view)
"""
from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Organisation, Role, User
from programs.models import (
    ServiceCenter, Client, ClinicVisit, OutreachSession,
    StockEntry, VisitorRegister,
)


def _make_user(email, org, role):
    return User.objects.create_user(
        email=email, password='pass', full_name='Test', organisation=org, role=role,
    )


def _make_center(organisation, name, code):
    return ServiceCenter.objects.create(
        organisation=organisation, name=name, code=code,
        center_type=ServiceCenter.DIC, district='Dhaka', is_active=True,
    )


class OrgIsolationSmokeTest(TestCase):
    """Each row of partner data should be visible only to its own org's
    manager (and to super admins). A leak would mean a PHD manager can see
    Bandhu rows or vice versa."""

    @classmethod
    def setUpTestData(cls):
        cls.phd_mgr     = _make_user('mgr@phd.org',    Organisation.PHD,    Role.MANAGER)
        cls.bandhu_mgr  = _make_user('mgr@bandhu.org', Organisation.BANDHU, Role.MANAGER)
        cls.super_admin = _make_user('sa@ciprb.org',   Organisation.CIPRB,  Role.SUPER_ADMIN)

        # Two ServiceCenters, one per org.
        cls.phd_center    = _make_center('PHD',    'PHD Center 1',    'PHD-001')
        cls.bandhu_center = _make_center('Bandhu', 'Bandhu Center 1', 'BAN-001')

        # Two Clients, one per org.
        cls.phd_client = Client.objects.create(
            organisation='PHD', center=cls.phd_center,
            client_id='PHD-C-1', name='Sample PHD client',
        )
        cls.bandhu_client = Client.objects.create(
            organisation='Bandhu', center=cls.bandhu_center,
            client_id='BAN-C-1', name='Sample Bandhu client',
        )

        # ClinicVisit — one per org.
        cls.phd_visit = ClinicVisit.objects.create(
            organisation='PHD', center=cls.phd_center, client=cls.phd_client,
            visit_date=date(2026, 5, 10),
        )
        cls.bandhu_visit = ClinicVisit.objects.create(
            organisation='Bandhu', center=cls.bandhu_center, client=cls.bandhu_client,
            visit_date=date(2026, 5, 11),
        )

        # OutreachSession — one per org.
        OutreachSession.objects.create(
            organisation='PHD', center=cls.phd_center,
            session_date=date(2026, 5, 12),
            peer_educator_name='PHD PE',
        )
        OutreachSession.objects.create(
            organisation='Bandhu', center=cls.bandhu_center,
            session_date=date(2026, 5, 13),
            peer_educator_name='Bandhu PE',
        )

        # StockEntry — one per org.
        StockEntry.objects.create(
            organisation='PHD', center=cls.phd_center,
            reporting_month=date(2026, 5, 1), item_name='PHD test item',
        )
        StockEntry.objects.create(
            organisation='Bandhu', center=cls.bandhu_center,
            reporting_month=date(2026, 5, 1), item_name='Bandhu test item',
        )

        # VisitorRegister — one per org.
        VisitorRegister.objects.create(
            organisation='PHD', center=cls.phd_center,
            visitor_name='PHD visitor', visit_date=date(2026, 5, 14),
        )
        VisitorRegister.objects.create(
            organisation='Bandhu', center=cls.bandhu_center,
            visitor_name='Bandhu visitor', visit_date=date(2026, 5, 15),
        )

    def setUp(self):
        self.client = APIClient()

    # ── ServiceCenter ──────────────────────────────────────────────────────

    def test_centers_phd_manager_sees_only_phd(self):
        self.client.force_authenticate(user=self.phd_mgr)
        resp = self.client.get('/api/programs/centers/')
        self.assertEqual(resp.status_code, 200)
        rows = self._rows(resp)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['organisation'], 'PHD')

    def test_centers_bandhu_manager_sees_only_bandhu(self):
        self.client.force_authenticate(user=self.bandhu_mgr)
        resp = self.client.get('/api/programs/centers/')
        self.assertEqual(resp.status_code, 200)
        rows = self._rows(resp)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['organisation'], 'Bandhu')

    def test_centers_super_admin_sees_both(self):
        self.client.force_authenticate(user=self.super_admin)
        resp = self.client.get('/api/programs/centers/')
        self.assertEqual(resp.status_code, 200)
        orgs = {r['organisation'] for r in self._rows(resp)}
        self.assertEqual(orgs, {'PHD', 'Bandhu'})

    # ── Clients ────────────────────────────────────────────────────────────

    def test_clients_phd_manager_sees_only_phd(self):
        self.client.force_authenticate(user=self.phd_mgr)
        rows = self._rows(self.client.get('/api/programs/clients/'))
        self.assertEqual({r['organisation'] for r in rows}, {'PHD'})

    def test_clients_bandhu_manager_sees_only_bandhu(self):
        self.client.force_authenticate(user=self.bandhu_mgr)
        rows = self._rows(self.client.get('/api/programs/clients/'))
        self.assertEqual({r['organisation'] for r in rows}, {'Bandhu'})

    # ── ClinicVisit (OrgFilteredViewSet + override) ────────────────────────

    def test_clinic_visits_phd_manager_sees_only_phd(self):
        self.client.force_authenticate(user=self.phd_mgr)
        rows = self._rows(self.client.get('/api/programs/clinic-visits/'))
        self.assertEqual({r['organisation'] for r in rows}, {'PHD'})

    def test_clinic_visits_bandhu_manager_sees_only_bandhu(self):
        self.client.force_authenticate(user=self.bandhu_mgr)
        rows = self._rows(self.client.get('/api/programs/clinic-visits/'))
        self.assertEqual({r['organisation'] for r in rows}, {'Bandhu'})

    def test_clinic_visits_bandhu_cannot_access_phd_visit_by_id(self):
        """Detail GET on another org's row should 404, never 200."""
        self.client.force_authenticate(user=self.bandhu_mgr)
        resp = self.client.get(f'/api/programs/clinic-visits/{self.phd_visit.pk}/')
        self.assertEqual(resp.status_code, 404)

    # ── OutreachSession ────────────────────────────────────────────────────

    def test_outreach_phd_manager_sees_only_phd(self):
        self.client.force_authenticate(user=self.phd_mgr)
        rows = self._rows(self.client.get('/api/programs/outreach-sessions/'))
        self.assertEqual({r['organisation'] for r in rows}, {'PHD'})

    def test_outreach_bandhu_manager_sees_only_bandhu(self):
        self.client.force_authenticate(user=self.bandhu_mgr)
        rows = self._rows(self.client.get('/api/programs/outreach-sessions/'))
        self.assertEqual({r['organisation'] for r in rows}, {'Bandhu'})

    # ── StockEntry ─────────────────────────────────────────────────────────

    def test_stock_entries_phd_manager_sees_only_phd(self):
        self.client.force_authenticate(user=self.phd_mgr)
        rows = self._rows(self.client.get('/api/programs/stock-entries/'))
        self.assertEqual({r['organisation'] for r in rows}, {'PHD'})

    def test_stock_entries_bandhu_manager_sees_only_bandhu(self):
        self.client.force_authenticate(user=self.bandhu_mgr)
        rows = self._rows(self.client.get('/api/programs/stock-entries/'))
        self.assertEqual({r['organisation'] for r in rows}, {'Bandhu'})

    # ── VisitorRegister ────────────────────────────────────────────────────

    def test_visitor_register_phd_manager_sees_only_phd(self):
        self.client.force_authenticate(user=self.phd_mgr)
        rows = self._rows(self.client.get('/api/programs/visitor-register/'))
        self.assertEqual({r['organisation'] for r in rows}, {'PHD'})

    def test_visitor_register_bandhu_manager_sees_only_bandhu(self):
        self.client.force_authenticate(user=self.bandhu_mgr)
        rows = self._rows(self.client.get('/api/programs/visitor-register/'))
        self.assertEqual({r['organisation'] for r in rows}, {'Bandhu'})

    # ── Aggregated PendingApprovalsView ────────────────────────────────────

    def test_pending_approvals_phd_manager_sees_only_phd(self):
        self.client.force_authenticate(user=self.phd_mgr)
        resp = self.client.get('/api/programs/pending-approvals/')
        self.assertEqual(resp.status_code, 200)
        orgs = {item['organisation'] for item in resp.data['items']}
        self.assertNotIn('Bandhu', orgs)

    def test_pending_approvals_bandhu_manager_sees_only_bandhu(self):
        self.client.force_authenticate(user=self.bandhu_mgr)
        resp = self.client.get('/api/programs/pending-approvals/')
        self.assertEqual(resp.status_code, 200)
        orgs = {item['organisation'] for item in resp.data['items']}
        self.assertNotIn('PHD', orgs)

    def test_pending_approvals_super_admin_sees_both(self):
        self.client.force_authenticate(user=self.super_admin)
        resp = self.client.get('/api/programs/pending-approvals/')
        self.assertEqual(resp.status_code, 200)
        orgs = {item['organisation'] for item in resp.data['items']}
        self.assertIn('PHD', orgs)
        self.assertIn('Bandhu', orgs)

    # ── Helpers ────────────────────────────────────────────────────────────

    @staticmethod
    def _rows(response):
        """DRF list endpoints may be paginated or bare lists."""
        data = response.data
        if isinstance(data, dict) and 'results' in data:
            return data['results']
        return data
