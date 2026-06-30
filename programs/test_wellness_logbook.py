"""F-01 Wellness Centre Service Logbook now persists as a REVIEWABLE record.

Previously _bnd_logbook was a Kobo-only no-op, so F-01 submissions never reached
the approval queue (the 'data in Kobo, not in approval' report). Now each F-01
submission creates a PENDING WellnessLogbookEntry that surfaces in the queue,
without feeding any indicator (F-05/F-06 stay the counted source)."""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from programs.bandhu_handlers import handle_bandhu_service_log
from programs.models import ServiceCenter, WellnessLogbookEntry
from accounts.models import User


def _bandhu_center():
    return ServiceCenter.objects.create(
        organisation='Bandhu', name='Bandhu DIC', code='BAN-001',
        center_type=ServiceCenter.DIC, district='Dhaka', is_active=True,
    )


def _f01(kobo_id='9001', cid='01-0001'):
    payload = {
        'record_type': 'wellness_logbook',
        'center_code': 'BAN-001',
        'log_date': '2026-06-29',
        'log_client_id': cid,
        '_id': kobo_id,
        '_submitted_by': 'bandhu_field_worker',
    }
    return handle_bandhu_service_log(payload, lat=23.7, lng=90.4)


class WellnessLogbookTest(TestCase):
    def setUp(self):
        cache.clear()
        self.center = _bandhu_center()

    def test_f01_creates_pending_reviewable_entry(self):
        resp = _f01()
        self.assertEqual(resp.status_code, 201)
        e = WellnessLogbookEntry.objects.get()
        self.assertEqual(e.organisation, 'Bandhu')
        self.assertEqual(e.approval_status, WellnessLogbookEntry.PENDING)
        self.assertEqual(e.client_id, '01-0001')
        self.assertEqual(str(e.service_date), '2026-06-29')
        self.assertTrue(e.raw_payload)  # full submission retained for the reviewer

    def test_f01_is_idempotent_on_redelivery(self):
        _f01(kobo_id='9001')
        _f01(kobo_id='9001')  # Kobo re-sends on redeploy — must not duplicate
        self.assertEqual(WellnessLogbookEntry.objects.count(), 1)

    def test_f01_surfaces_in_approval_queue(self):
        _f01()
        dev = User.objects.create_user(
            email='dev@x.org', password='Str0ng-Passw0rd-2026', full_name='Dev',
            organisation='CIPRB', role='developer',
        )
        c = APIClient()
        c.force_authenticate(dev)
        r = c.get('/api/programs/pending-approvals/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('wellness_logbook', str(r.content))
