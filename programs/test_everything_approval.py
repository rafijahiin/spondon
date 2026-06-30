"""Every form goes through the approval queue — no auto-approve bypasses.

Closes the auto-approve paths (Rafi: everything in the site must be approved):
  - Bandhu Mother List registration (was auto-approved like PHD used to be)
  - PHD monthly counselling summary (was auto-approved as an aggregate)
and proves field logging is NOT blocked while a registration is PENDING (the
just-registered mother stays in the pulldata lookup CSV until she is REJECTED)."""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from programs.bandhu_handlers import handle_bandhu_mother_list
from programs.phd_handlers import _phd_counselling
from programs.management.commands.export_bandhu_clients import build_csv
from programs.models import ServiceCenter, Client, PHDCounsellingReport
from accounts.models import User


def _center(org, code):
    return ServiceCenter.objects.create(
        organisation=org, name=f'{org} centre', code=code,
        center_type=ServiceCenter.DIC, district='Dhaka', is_active=True,
    )


class BandhuRegistrationApprovalTest(TestCase):
    def setUp(self):
        cache.clear()
        self.center = _center('Bandhu', 'BAN-001')

    def _register(self, kobo_id='5001', mlid='01-0001', name='Asha'):
        payload = {
            'center_code': 'BAN-001',
            'ml_id_no': mlid, 'ml_name': name, 'ml_gender': '05',
            '_id': kobo_id, '_submitted_by': 'bandhu_worker',
        }
        return handle_bandhu_mother_list(payload, lat=23.7, lng=90.4)

    def test_registration_lands_pending_not_approved(self):
        resp = self._register()
        self.assertEqual(resp.status_code, 201)
        c = Client.objects.get(client_id='01-0001')
        self.assertEqual(c.approval_status, Client.PENDING)

    def test_pending_client_is_loggable_in_csv(self):
        # A freshly-registered (PENDING) mother must still be in the lookup CSV
        # so the field can record her services before approval completes.
        self._register(name='Asha')
        csv_bytes, n = build_csv()
        self.assertEqual(n, 1)
        self.assertIn(b'01-0001', csv_bytes)
        self.assertIn(b'Asha', csv_bytes)

    def test_rejected_client_drops_out_of_csv(self):
        self._register()
        c = Client.objects.get(client_id='01-0001')
        c.approval_status = Client.REJECTED
        c.save()
        _, n = build_csv()
        self.assertEqual(n, 0)


class PHDCounsellingApprovalTest(TestCase):
    def setUp(self):
        cache.clear()
        self.center = _center('PHD', 'PHD-001')

    def _report(self, kobo_id='6001'):
        payload = {
            'center_code': 'PHD-001',
            'counsel_date': '2026-06-01', 'counsel_prepared_by': 'Counsellor',
            'counsel_total': '12', 'counsel_hiv_test': '4',
            '_id': kobo_id, '_submitted_by': 'phd_counsellor',
        }
        return _phd_counselling(payload, lat=23.7, lng=90.4)

    def test_counselling_report_lands_pending(self):
        resp = self._report()
        self.assertEqual(resp.status_code, 201)
        r = PHDCounsellingReport.objects.get()
        self.assertEqual(r.approval_status, PHDCounsellingReport.PENDING)

    def test_counselling_report_surfaces_in_queue(self):
        self._report()
        dev = User.objects.create_user(
            email='dev@x.org', password='Str0ng-Passw0rd-2026', full_name='Dev',
            organisation='CIPRB', role='developer',
        )
        c = APIClient()
        c.force_authenticate(dev)
        r = c.get('/api/programs/pending-approvals/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('counselling_report', str(r.content))
