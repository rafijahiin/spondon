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
        cls.supervisor = _make_user('sa@ciprb.org',   Organisation.CIPRB,  Role.SUPERVISOR)

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

    def test_centers_supervisor_sees_both(self):
        self.client.force_authenticate(user=self.supervisor)
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

    def test_pending_approvals_supervisor_sees_both(self):
        self.client.force_authenticate(user=self.supervisor)
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


# ─── Step 5: meeting / training mandatory upload gate ────────────────────────

import io
from datetime import date as _date
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from programs.models import (
    CoordMeeting, TrainingEvent, ServiceCenter,
)
from programs.serializers import CoordMeetingSerializer, TrainingEventSerializer


def _tiny_file(name='notes.pdf', content=b'%PDF-1.4\n%fake\n'):
    """Build a small in-memory file safe for serializer / model validation."""
    return SimpleUploadedFile(name, content, content_type='application/pdf')


def _oversize_photo(name='big.jpg', size_mb=3):
    """JPEG-ish payload over the 2 MiB cap."""
    content = b'\xff\xd8\xff\xe0' + b'\x00' * (size_mb * 1024 * 1024)
    return SimpleUploadedFile(name, content, content_type='image/jpeg')


def _under_photo(name='small.jpg', size_kb=512):
    content = b'\xff\xd8\xff\xe0' + b'\x00' * (size_kb * 1024)
    return SimpleUploadedFile(name, content, content_type='image/jpeg')


class CoordMeetingUploadGateTest(TestCase):
    """The meeting_notes upload is enforced at every layer."""

    def setUp(self):
        self.center = ServiceCenter.objects.create(
            organisation='Bandhu', name='Dhaka KP Clinic', code='BAN-001',
            center_type='DIC', district='Dhaka', upazila='Dhanmondi',
        )

    def _base_payload(self):
        return {
            'organisation': 'Bandhu',
            'center': self.center.id,
            'meeting_date': str(_date.today()),
            'meeting_type': CoordMeeting.GOB,
            'location_text': 'Civil Surgeon Office',
            'participant_count': 12,
            'agenda': 'Quarterly review',
        }

    def test_serializer_rejects_missing_meeting_notes(self):
        ser = CoordMeetingSerializer(data=self._base_payload())
        self.assertFalse(ser.is_valid())
        self.assertIn('meeting_notes', ser.errors)

    def test_serializer_accepts_meeting_notes(self):
        data = self._base_payload()
        data['meeting_notes'] = _tiny_file()
        ser = CoordMeetingSerializer(data=data)
        self.assertTrue(ser.is_valid(), msg=str(ser.errors))

    def test_serializer_rejects_oversize_photo(self):
        data = self._base_payload()
        data['meeting_notes'] = _tiny_file()
        data['photo'] = _oversize_photo(size_mb=3)
        ser = CoordMeetingSerializer(data=data)
        self.assertFalse(ser.is_valid())
        self.assertIn('photo', ser.errors)

    def test_serializer_under_2mb_photo_not_rejected_for_size(self):
        data = self._base_payload()
        data['meeting_notes'] = _tiny_file()
        data['photo'] = _under_photo(size_kb=512)
        ser = CoordMeetingSerializer(data=data)
        # Pillow's image-content check may still reject the synthetic
        # JPEG — for the size gate we only assert no size-related error
        # message fires.
        ser.is_valid()
        for err in ser.errors.get('photo', []):
            self.assertNotIn(
                'too large', str(err),
                msg=f'2 MiB gate should not trip on <2MiB photo: {err}',
            )

    def test_model_clean_raises_without_meeting_notes(self):
        m = CoordMeeting(
            organisation='Bandhu', center=self.center,
            meeting_date=_date.today(), meeting_type=CoordMeeting.GOB,
            participant_count=10,
        )
        with self.assertRaises(ValidationError) as cm:
            m.full_clean()
        self.assertIn('meeting_notes', cm.exception.message_dict)


class TrainingEventUploadGateTest(TestCase):
    """The training-event report_file upload is enforced at every layer."""

    def setUp(self):
        self.center = ServiceCenter.objects.create(
            organisation='PHD', name='Daulatdia Brothel Centre', code='PHD-001',
            center_type='BROTHEL', district='Rajbari', upazila='Goalondo',
        )

    def _base_payload(self):
        return {
            'organisation': 'PHD',
            'center': self.center.id,
            'event_date': str(_date.today()),
            'event_type': TrainingEvent.TRAINING,
            'participant_type': TrainingEvent.MW,
            'topic': 'Safe motherhood — refresher',
            'total_participants': 8,
        }

    def test_serializer_rejects_missing_report_file(self):
        ser = TrainingEventSerializer(data=self._base_payload())
        self.assertFalse(ser.is_valid())
        self.assertIn('report_file', ser.errors)

    def test_serializer_accepts_report_file(self):
        data = self._base_payload()
        data['report_file'] = _tiny_file('report.pdf')
        ser = TrainingEventSerializer(data=data)
        self.assertTrue(ser.is_valid(), msg=str(ser.errors))

    def test_model_clean_raises_without_report_file(self):
        e = TrainingEvent(
            organisation='PHD', center=self.center,
            event_date=_date.today(), event_type=TrainingEvent.TRAINING,
            participant_type=TrainingEvent.MW, topic='X',
            total_participants=5,
        )
        with self.assertRaises(ValidationError) as cm:
            e.full_clean()
        self.assertIn('report_file', cm.exception.message_dict)

    def test_oversize_photo_rejected_at_serializer(self):
        data = self._base_payload()
        data['report_file'] = _tiny_file('report.pdf')
        data['photo'] = _oversize_photo(size_mb=3)
        ser = TrainingEventSerializer(data=data)
        self.assertFalse(ser.is_valid())
        self.assertIn('photo', ser.errors)
