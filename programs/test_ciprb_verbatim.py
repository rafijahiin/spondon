"""
Verbatim-form handler tests for the rebuilt CIPRB-6 Social Autopsy (and, later,
the notification slips). Confirms the meeting-report shape maps correctly onto
MPDSRCase sa_md without the death-date requirement the death-review path imposes.
"""
import datetime
from django.test import TestCase

from mpdsr.models import MPDSRCase, DeathType
from programs.ciprb_handlers import handle_ciprb_social_autopsy


def _sa_payload(**over):
    p = {
        'organisation': 'CIPRB',
        'sa_death_type': '1',
        'meeting_date': '2026-06-20',
        'district': 'dhaka',
        'upazila': 'Dhamrai',
        'union': 'Kushura',
        'ward': '3',
        'village': 'Boyra',
        'slip_number': 'SL-100',
        'deceased_name': 'Rahima',
        'age_years': '27',
        'age_months': '0',
        'age_days': '0',
        'sa_sex': '',
        'death_narrative': 'Bled heavily after home delivery; reached facility late.',
        'prevention_1': 'Earlier referral',
        'prevention_2': 'Skilled birth attendant',
        'decision_1': 'Orient TBAs',
        'members_male': '4',
        'members_female': '6',
        'pregnant_women': '2',
        'collector_name': 'Karim',
        'collector_designation': 'FWV',
        '_id': 'SA1',
        '_submitted_by': 'kobo',
    }
    p.update(over)
    return p


class SocialAutopsyHandlerTest(TestCase):
    def test_meeting_report_maps_to_mpdsr_case(self):
        r = handle_ciprb_social_autopsy(_sa_payload(), 23.7, 90.4)
        self.assertEqual(r.status_code, 200)
        c = MPDSRCase.objects.get(sub_form_type='sa_md')
        self.assertEqual(c.district, 'Dhaka')
        self.assertEqual(c.approval_status, 'PENDING')
        self.assertEqual(c.date_of_death, datetime.date(2026, 6, 20))   # meeting date stands in
        self.assertEqual(c.committee_date, datetime.date(2026, 6, 20))
        self.assertEqual(c.death_type, DeathType.MATERNAL)
        self.assertEqual(c.age_years, 27)
        self.assertIn('Bled heavily', c.notes)
        self.assertIn('Earlier referral', c.action_plan)
        self.assertIn('Decisions:', c.action_plan)
        self.assertIn('Orient TBAs', c.action_plan)
        # full submission preserved (name is PII-minimised out of columns)
        self.assertEqual(c.raw_payload['deceased_name'], 'Rahima')
        self.assertEqual(c.raw_payload['members_female'], '6')

    def test_stillbirth_code_maps_to_perinatal(self):
        handle_ciprb_social_autopsy(_sa_payload(sa_death_type='3', slip_number='SL-200', _id='SA2'), None, None)
        c = MPDSRCase.objects.get(case_hash='sa:SL-200')
        self.assertEqual(c.death_type, DeathType.PERINATAL)

    def test_resubmit_same_slip_updates_one_row(self):
        handle_ciprb_social_autopsy(_sa_payload(_id='SA1'), None, None)
        handle_ciprb_social_autopsy(_sa_payload(_id='SA1b', death_narrative='Revised narrative'), None, None)
        rows = MPDSRCase.objects.filter(sub_form_type='sa_md', case_hash='sa:SL-100')
        self.assertEqual(rows.count(), 1)
        self.assertIn('Revised narrative', rows.first().notes)

    def test_missing_meeting_date_rejected(self):
        r = handle_ciprb_social_autopsy(_sa_payload(meeting_date=''), None, None)
        self.assertEqual(r.status_code, 400)
