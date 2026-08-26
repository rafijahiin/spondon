"""The dangerous paths first: a partial read must never look like a deletion."""
from unittest import mock

from django.test import TestCase

from programs import kobo_withdrawals as kw
from programs.models import (Client, ClinicVisit, KoboWithdrawal, ServiceCenter)


def _centre():
    return ServiceCenter.objects.create(
        code='BND-DIC-99', name='Test Centre', organisation='Bandhu',
        district='Habiganj')


def _client(centre, cid, kobo):
    return Client.objects.create(
        client_id=cid, organisation='Bandhu', center=centre, name='A',
        kobo_submission_id=kobo, approval_status=Client.APPROVED)


class FetchGuardTests(TestCase):
    """Absence only means deletion when the read was complete."""

    def test_zero_assets_aborts(self):
        with mock.patch.object(kw, '_get', return_value={'results': []}):
            with self.assertRaises(kw.FetchIncomplete):
                kw.deployed_assets('tok')

    def test_http_error_aborts(self):
        resp = mock.Mock(ok=False, status_code=502)
        with mock.patch.object(kw.requests, 'get', return_value=resp):
            with self.assertRaises(kw.FetchIncomplete):
                kw._get('http://x', 'tok')

    def test_network_error_aborts(self):
        with mock.patch.object(kw.requests, 'get',
                               side_effect=kw.requests.RequestException('down')):
            with self.assertRaises(kw.FetchIncomplete):
                kw._get('http://x', 'tok')

    def test_every_form_empty_aborts(self):
        """A silent token failure returns empty pages, not an error."""
        assets = [{'uid': 'a1', 'name': 'F1', 'asset_type': 'survey',
                   'has_deployment': True}]
        with mock.patch.object(kw, 'deployed_assets', return_value=assets), \
             mock.patch.object(kw, '_get', return_value={'results': []}):
            with self.assertRaises(kw.FetchIncomplete):
                kw.live_submission_ids('tok')

    def test_reconcile_aborts_before_touching_anything(self):
        centre = _centre()
        _client(centre, 'HB-0001', '111')
        with mock.patch.object(kw, 'live_submission_ids',
                               side_effect=kw.FetchIncomplete('boom')):
            with self.assertRaises(kw.FetchIncomplete):
                kw.reconcile(apply=True)
        self.assertEqual(Client.objects.count(), 1)


class DetectionTests(TestCase):
    def setUp(self):
        self.centre = _centre()

    def test_missing_id_is_detected(self):
        _client(self.centre, 'HB-0001', '111')
        rows = kw.find_withdrawn({'222'})
        self.assertEqual([r[1].kobo_submission_id for r in rows], ['111'])

    def test_present_id_is_left_alone(self):
        _client(self.centre, 'HB-0001', '111')
        self.assertEqual(kw.find_withdrawn({'111'}), [])

    def test_records_without_a_kobo_id_are_never_touched(self):
        """Dashboard-entered rows have no Kobo id; Kobo has no opinion on them."""
        Client.objects.create(client_id='HB-0002', organisation='Bandhu',
                              center=self.centre, name='B',
                              kobo_submission_id=None)
        self.assertEqual(kw.find_withdrawn(set()), [])


class WithdrawTests(TestCase):
    def setUp(self):
        self.centre = _centre()

    def test_size_cap_refuses_without_force(self):
        for i in range(3):
            _client(self.centre, 'HB-000%d' % i, str(100 + i))
        rows = kw.find_withdrawn(set())
        with self.assertRaises(kw.FetchIncomplete):
            kw.withdraw(rows, max_delete=2)
        self.assertEqual(Client.objects.count(), 3)

    def test_force_gets_past_the_cap(self):
        for i in range(3):
            _client(self.centre, 'HB-000%d' % i, str(100 + i))
        deleted, blocked = kw.withdraw(kw.find_withdrawn(set()), max_delete=2,
                                       force=True)
        self.assertEqual(len(deleted), 3)
        self.assertEqual(blocked, [])
        self.assertEqual(Client.objects.count(), 0)

    def test_deletion_is_recorded_before_it_happens(self):
        c = _client(self.centre, 'HB-0001', '111')
        kw.withdraw(kw.find_withdrawn(set()), actor='tester')
        entry = KoboWithdrawal.objects.get()
        self.assertEqual(entry.kobo_submission_id, '111')
        self.assertEqual(entry.model_label, 'programs.Client')
        self.assertEqual(entry.approval_status, Client.APPROVED)
        self.assertEqual(entry.actor, 'tester')
        self.assertEqual(entry.snapshot.get('client_id'), 'HB-0001')
        self.assertFalse(Client.objects.filter(pk=c.pk).exists())

    def test_a_client_with_services_is_blocked_not_orphaned(self):
        c = _client(self.centre, 'HB-0001', '111')
        ClinicVisit.objects.create(organisation='Bandhu', center=self.centre,
                                   client=c, visit_date='2026-08-01')
        deleted, blocked = kw.withdraw(kw.find_withdrawn({'999'}))
        self.assertEqual(deleted, [])
        self.assertEqual(len(blocked), 1)
        self.assertTrue(Client.objects.filter(pk=c.pk).exists())
        # The audit row must not survive a rollback and claim a deletion that
        # never happened.
        self.assertEqual(KoboWithdrawal.objects.count(), 0)


class DryRunTests(TestCase):
    def test_dry_run_changes_nothing(self):
        centre = _centre()
        _client(centre, 'HB-0001', '111')
        with mock.patch.object(kw, 'live_submission_ids',
                               return_value=({'222'}, {'F1': 1})):
            r = kw.reconcile(apply=False)
        self.assertEqual(len(r['candidates']), 1)
        self.assertEqual(r['deleted'], [])
        self.assertEqual(Client.objects.count(), 1)
        self.assertEqual(KoboWithdrawal.objects.count(), 0)
