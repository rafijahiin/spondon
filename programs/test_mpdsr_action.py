"""
CIPRB-10 MPDSR Action-Plan handler — regression tests for the 2026-06 hardening:
idempotency, district-scoped upsert, collision reallocation, no-phantom-stub,
status/completion coupling, fail-closed default, and the PENDING-inclusive CSV.
"""
from django.test import TestCase

from mpdsr.models import (MPDSRAction, ActionStatus, STUB_ACTIVITY_SENTINEL,
                          DISTRICT_ACTION_CODE)
from programs.ciprb_handlers import handle_ciprb_mpdsr_action_plan
from programs.management.commands.export_mpdsr_actions import build_csv


def _new_plan(action_id, *, district='dhaka', activity='Train CHCPs',
              who='Alice', sub_id='S1', status=''):
    return handle_ciprb_mpdsr_action_plan({
        'ap_mode': 'new_plan',
        'district': district,
        'action_id': action_id,
        'act_activity': activity,
        'rp_section': 'system_strengthening',
        'act_status': status,
        'enumerator_name': who,
        '_id': sub_id,
        '_submitted_by': 'kobo',
    }, None, None)


def _update(action_id, *, district='dhaka', new_status='in_progress',
            completion='50', who='Bob', sub_id='U1'):
    return handle_ciprb_mpdsr_action_plan({
        'ap_mode': 'update_action',
        'district': district,
        'ap_action_sel': action_id,
        'ap_new_status': new_status,
        'ap_new_completion': completion,
        'enumerator_name': who,
        '_id': sub_id,
        '_submitted_by': 'kobo',
    }, None, None)


class NewPlanTest(TestCase):
    def test_new_plan_creates_pending_with_creator(self):
        r = _new_plan('DH-001')
        self.assertEqual(r.status_code, 200)
        act = MPDSRAction.objects.get(action_id='DH-001')
        self.assertEqual(act.district, 'Dhaka')
        self.assertEqual(act.approval_status, 'PENDING')
        self.assertEqual(act.creator_name, 'Alice')
        self.assertEqual(act.organisation, 'CIPRB')

    def test_default_approval_status_is_pending(self):
        # Fail-closed: any creation path that forgets to set it lands PENDING.
        act = MPDSRAction.objects.create(
            action_id='DH-009', district='Dhaka',
            section='system_strengthening', activity='x')
        self.assertEqual(act.approval_status, 'PENDING')


class IdempotencyTest(TestCase):
    def test_redelivery_does_not_revert_approval(self):
        _new_plan('DH-001', sub_id='X1')
        act = MPDSRAction.objects.get(action_id='DH-001')
        act.approval_status = 'APPROVED'
        act.save()
        audit_len = len(act.audit_trail)
        # Kobo re-delivers the SAME _id.
        r = _new_plan('DH-001', sub_id='X1', activity='changed')
        self.assertEqual(r.status_code, 200)
        act.refresh_from_db()
        self.assertEqual(act.approval_status, 'APPROVED')      # not reverted
        self.assertEqual(act.activity, 'Train CHCPs')          # not overwritten
        self.assertEqual(len(act.audit_trail), audit_len)      # not double-logged


class CollisionTest(TestCase):
    def test_different_creator_same_id_is_reallocated(self):
        _new_plan('DH-001', who='Alice', activity='Alice action', sub_id='A1')
        r = _new_plan('DH-001', who='Bob', activity='Bob action', sub_id='B1')
        self.assertEqual(r.status_code, 200)
        # Both actions survive; Bob's was reallocated to a fresh id.
        self.assertEqual(MPDSRAction.objects.count(), 2)
        ids = set(MPDSRAction.objects.values_list('action_id', flat=True))
        self.assertEqual(ids, {'DH-001', 'DH-002'})
        alice = MPDSRAction.objects.get(action_id='DH-001')
        bob = MPDSRAction.objects.get(action_id='DH-002')
        self.assertEqual(alice.activity, 'Alice action')
        self.assertEqual(bob.activity, 'Bob action')
        self.assertEqual(bob.creator_name, 'Bob')

    def test_same_creator_reregistration_updates_in_place(self):
        _new_plan('DH-001', who='Alice', activity='v1', sub_id='A1')
        _new_plan('DH-001', who='Alice', activity='v2', sub_id='A2')
        self.assertEqual(MPDSRAction.objects.count(), 1)
        act = MPDSRAction.objects.get(action_id='DH-001')
        self.assertEqual(act.activity, 'v2')
        self.assertEqual(act.creator_name, 'Alice')   # immutable


class UpdateActionTest(TestCase):
    def test_unknown_id_is_ignored_no_phantom(self):
        r = _update('DH-404')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(MPDSRAction.objects.count(), 0)        # no stub row

    def test_update_advances_and_repends(self):
        _new_plan('DH-001', sub_id='A1')
        act = MPDSRAction.objects.get(action_id='DH-001')
        act.approval_status = 'APPROVED'
        act.save()
        r = _update('DH-001', new_status='in_progress', completion='50',
                    who='Carol', sub_id='U1')
        self.assertEqual(r.status_code, 200)
        act.refresh_from_db()
        self.assertEqual(act.status, 'in_progress')
        self.assertEqual(act.completion_pct, 50)
        self.assertEqual(act.approval_status, 'PENDING')        # re-enters gate
        self.assertIsNone(act.approved_by)
        self.assertEqual(act.last_edited_by_name, 'Carol')

    def test_status_completion_coupling(self):
        _new_plan('DH-001', sub_id='A1')
        # Implemented forces 100%.
        _update('DH-001', new_status='implemented', completion='0', sub_id='U1')
        act = MPDSRAction.objects.get(action_id='DH-001')
        self.assertEqual(act.completion_pct, 100)
        self.assertEqual(act.status, 'implemented')
        # 100% forces Implemented.
        _update('DH-001', new_status='in_progress', completion='100', sub_id='U2')
        act.refresh_from_db()
        self.assertEqual(act.status, 'implemented')


class CsvTest(TestCase):
    def test_pending_action_is_in_lookup_csv(self):
        _new_plan('DH-001', sub_id='A1')                        # PENDING
        csv_bytes, n = build_csv()
        self.assertIn('DH-001', csv_bytes.decode('utf-8'))
        self.assertGreaterEqual(n, 1)
        self.assertIn('district_slug', csv_bytes.decode('utf-8').splitlines()[0])

    def test_stub_is_excluded_from_csv(self):
        MPDSRAction.objects.create(
            action_id='DH-777', district='Dhaka', section='system_strengthening',
            activity=STUB_ACTIVITY_SENTINEL, approval_status='PENDING')
        csv_bytes, n = build_csv()
        self.assertNotIn('DH-777', csv_bytes.decode('utf-8'))


class MapIntegrityTest(TestCase):
    def test_all_district_codes_unique(self):
        self.assertEqual(len(set(DISTRICT_ACTION_CODE.values())),
                         len(DISTRICT_ACTION_CODE))

    def test_next_action_id_is_three_digit_canonical(self):
        self.assertEqual(MPDSRAction.next_action_id('Rangpur'), 'RA-001')
        MPDSRAction.objects.create(action_id='RA-001', district='Rangpur',
                                   section='system_strengthening', activity='x')
        self.assertEqual(MPDSRAction.next_action_id('Rangpur'), 'RA-002')
