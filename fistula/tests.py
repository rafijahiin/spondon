"""
Tests for the fistula app — refactored to match the current
FistulaCampaign aggregate model.

The previous test file targeted a now-removed FistulaCase model (with
encrypted patient PII, per-case status workflow, and an overdue follow-up
flow). Migration 0002_fistulacampaign_delete_fistulacase_and_more
replaced that with a campaign-session aggregate model — no PII at the
row level, no per-case workflow, just one record per outreach/screening
session with aggregated reach + referral + surgery counts.

The encryption helpers (fistula/encryption.py) are still in the codebase
for re-use by other modules; tests in EncryptionTest stay.
"""
import datetime

from cryptography.fernet import Fernet
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Organisation, Role, User
from submissions.models import FormType, KoboSubmission, SubmissionStatus

from .encryption import decrypt, encrypt
from .models import FistulaCampaign

TEST_KEY = Fernet.generate_key().decode()
BASE_URL = '/api/fistula/cases/'


def make_user(email, org, role):
    return User.objects.create_user(
        email=email, password='pass', full_name='Test',
        organisation=org, role=role,
    )


def _rows(resp):
    """Return list of rows whether the response is paginated or a plain list."""
    data = resp.data
    if isinstance(data, dict) and 'results' in data:
        return data['results']
    return data


def make_submission(partner='PHD', kobo_id='k001'):
    # PENDING so the post_save signal does not auto-create the
    # FistulaCampaign; the manager-method test exercises the
    # creation path directly.
    return KoboSubmission.objects.create(
        kobo_id=kobo_id,
        form_type=FormType.FISTULA,
        partner=partner,
        worker_name='Rina',
        district='Dhaka',
        region='Dhaka',
        submitted_at=timezone.now(),
        raw_data={
            'district': 'Dhaka',
            'upazila': 'Dhanmondi',
            'women_screened': '40',
            'confirmed_fistula_cases': '3',
            'cases_referred': '2',
        },
        status=SubmissionStatus.PENDING,
    )


def make_campaign(partner='PHD', district='Dhaka', campaign_date=None,
                  women_screened=0, confirmed=0, referred=0):
    if campaign_date is None:
        campaign_date = datetime.date.today()
    return FistulaCampaign.objects.create(
        partner=partner,
        district=district,
        region='Dhaka',
        campaign_date=campaign_date,
        women_screened=women_screened,
        confirmed_fistula_cases=confirmed,
        cases_referred=referred,
    )


# ─── Encryption helpers ──────────────────────────────────────────────────────

@override_settings(FERNET_KEY=TEST_KEY)
class EncryptionTest(TestCase):

    def test_encrypt_decrypt_round_trip(self):
        ciphertext = encrypt('Fatema Begum')
        self.assertNotEqual(ciphertext, 'Fatema Begum')
        self.assertEqual(decrypt(ciphertext), 'Fatema Begum')

    def test_empty_string_returns_empty(self):
        self.assertEqual(encrypt(''), '')
        self.assertEqual(decrypt(''), '')

    def test_different_ciphertexts_for_same_plaintext(self):
        # Fernet uses random IV so each encryption produces unique ciphertext
        c1 = encrypt('test')
        c2 = encrypt('test')
        self.assertNotEqual(c1, c2)
        self.assertEqual(decrypt(c1), 'test')
        self.assertEqual(decrypt(c2), 'test')

    def test_invalid_ciphertext_returns_empty(self):
        self.assertEqual(decrypt('not-valid-ciphertext'), '')


# ─── FistulaCampaign model ───────────────────────────────────────────────────

class FistulaCampaignModelTest(TestCase):

    def test_case_hash_auto_generated(self):
        camp = make_campaign()
        self.assertTrue(camp.case_hash.startswith('FST-PHD-'))

    def test_bandhu_hash_prefix(self):
        camp = make_campaign(partner='Bandhu')
        self.assertIn('BON', camp.case_hash)

    def test_str_contains_case_hash(self):
        camp = make_campaign()
        self.assertIn('FST-', str(camp))


# ─── get_or_create_from_submission ───────────────────────────────────────────

class FromSubmissionTest(TestCase):

    def test_creates_campaign_from_submission(self):
        sub = make_submission()
        camp, created = FistulaCampaign.objects.get_or_create_from_submission(sub)
        self.assertTrue(created)
        self.assertEqual(camp.partner, 'PHD')
        self.assertEqual(camp.district, 'Dhaka')
        self.assertEqual(camp.women_screened, 40)
        self.assertEqual(camp.confirmed_fistula_cases, 3)
        self.assertEqual(camp.cases_referred, 2)

    def test_idempotent_get_or_create(self):
        sub = make_submission(kobo_id='k002')
        _, c1 = FistulaCampaign.objects.get_or_create_from_submission(sub)
        _, c2 = FistulaCampaign.objects.get_or_create_from_submission(sub)
        self.assertTrue(c1)
        self.assertFalse(c2)
        self.assertEqual(FistulaCampaign.objects.count(), 1)

    def test_missing_aggregate_fields_default_to_zero(self):
        sub = make_submission(kobo_id='k003')
        sub.raw_data = {}
        sub.save()
        camp, _ = FistulaCampaign.objects.get_or_create_from_submission(sub)
        self.assertEqual(camp.women_screened, 0)
        self.assertEqual(camp.confirmed_fistula_cases, 0)


# ─── API — list, org isolation, write methods blocked ────────────────────────

class FistulaCampaignAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.phd = make_user('pm@phd.org', Organisation.PHD, Role.MANAGER)
        self.bandhu = make_user('bm@bandhu.org', Organisation.BANDHU, Role.MANAGER)

    def test_unauthenticated_returns_403(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, 403)

    def test_phd_manager_sees_only_phd_campaigns(self):
        make_campaign(partner='PHD')
        make_campaign(partner='Bandhu')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, 200)
        rows = _rows(resp)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['partner'], 'PHD')

    def test_bandhu_cannot_see_phd_campaigns(self):
        make_campaign(partner='PHD')
        self.client.force_authenticate(user=self.bandhu)
        resp = self.client.get(BASE_URL)
        self.assertEqual(len(_rows(resp)), 0)

    def test_post_not_allowed(self):
        # Viewset is read-only — http_method_names = ['get', 'head', 'options']
        self.client.force_authenticate(user=self.phd)
        resp = self.client.post(BASE_URL, {}, format='json')
        self.assertEqual(resp.status_code, 405)

    def test_delete_not_allowed(self):
        camp = make_campaign(partner='PHD')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.delete(f'{BASE_URL}{camp.id}/')
        self.assertEqual(resp.status_code, 405)


# ─── Stats endpoint ──────────────────────────────────────────────────────────

class StatsEndpointTest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.phd = make_user('pm@phd.org', Organisation.PHD, Role.MANAGER)

    def test_stats_keys_present(self):
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}stats/')
        self.assertEqual(resp.status_code, 200)
        for key in (
            'total_sessions',
            'this_month_sessions',
            'this_month_women_screened',
            'this_month_confirmed_cases',
            'this_month_cases_referred',
            'this_month_surgery_completed',
        ):
            self.assertIn(key, resp.data)

    def test_stats_aggregates_this_month(self):
        today = datetime.date.today()
        make_campaign(partner='PHD', campaign_date=today,
                      women_screened=50, confirmed=4, referred=2)
        make_campaign(partner='PHD', campaign_date=today,
                      women_screened=30, confirmed=2, referred=1)
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}stats/')
        self.assertEqual(resp.data['total_sessions'], 2)
        self.assertEqual(resp.data['this_month_sessions'], 2)
        self.assertEqual(resp.data['this_month_women_screened'], 80)
        self.assertEqual(resp.data['this_month_confirmed_cases'], 6)
        self.assertEqual(resp.data['this_month_cases_referred'], 3)

    def test_stats_org_isolated(self):
        make_campaign(partner='Bandhu')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}stats/')
        self.assertEqual(resp.data['total_sessions'], 0)


# ─── Daily CHW campaign webhook handler ──────────────────────────────────────

def _daily_campaign_payload(kobo_id='daily-1'):
    """A ciprb_fistula_campaign_v1 (daily CHW activity) submission payload."""
    return {
        '_id': kobo_id,
        '_xform_id_string': 'ciprb_fistula_campaign_v1',
        '_submitted_by': 'chw_rina',
        'organisation': 'CIPRB',
        'collection_date': '2026-07-01',
        'union': 'abc',
        'upazila': 'Dhanmondi',
        'district': 'dhaka',
        'staff_hi_ahi': '2', 'staff_ha': '3', 'staff_chcp': '1',
        'staff_fwv': '1', 'staff_fpi': '0', 'staff_fwa': '4', 'staff_chw': '6',
        'focal_community': '5', 'focal_epi': '2', 'focal_fwc': '1', 'focal_cc': '3',
        'households_visited': '120',
        'population_covered': '540',
        'suspected_patients': '7',
        'diagnosed_patients': '3',
        'referral': '2',
        'surgeries': '1',
        'rehabilitation': '4',
        'enumerator_name': 'Rina Akter',
        'enumerator_mobile': '01710000000',
    }


class CIPRBFistulaDailyCampaignWebhookTest(TestCase):

    def test_creates_pending_campaign_with_correct_mappings(self):
        from fistula.webhook_handlers import handle_ciprb_fistula_campaign
        resp = handle_ciprb_fistula_campaign(
            _daily_campaign_payload(), lat=23.75, lng=90.38)
        self.assertEqual(resp.status_code, 201)

        self.assertEqual(FistulaCampaign.objects.count(), 1)
        camp = FistulaCampaign.objects.get()
        # Partner / org / approval
        self.assertEqual(camp.partner, 'CIPRB')
        self.assertEqual(camp.organisation, 'CIPRB')
        self.assertEqual(camp.approval_status, 'PENDING')
        # CIP prefix on the auto case_hash (the save() prefix fix)
        self.assertTrue(camp.case_hash.startswith('FST-CIP-'), camp.case_hash)
        # Reach
        self.assertEqual(camp.households_visited, 120)
        self.assertEqual(camp.population_covered, 540)
        # Staff / focal head-counts
        self.assertEqual(camp.staff_chw, 6)
        self.assertEqual(camp.focal_community, 5)
        # Outcome mappings (form field → model field)
        self.assertEqual(camp.suspected_fistula_cases, 7)      # suspected_patients
        self.assertEqual(camp.confirmed_fistula_cases, 3)      # diagnosed_patients
        self.assertEqual(camp.cases_referred, 2)               # referral
        self.assertEqual(camp.cases_surgery_completed, 1)      # surgeries
        self.assertEqual(camp.cases_social_reintegration, 4)   # rehabilitation
        # Provenance
        self.assertEqual(camp.kobo_submission_id, 'daily-1')
        self.assertEqual(camp.submitted_by_kobo_user, 'chw_rina')
        self.assertEqual(camp.enumerator_name, 'Rina Akter')
        self.assertEqual(str(camp.campaign_date), '2026-07-01')

    def test_idempotent_on_kobo_id(self):
        from fistula.webhook_handlers import handle_ciprb_fistula_campaign
        payload = _daily_campaign_payload(kobo_id='dup-9')
        r1 = handle_ciprb_fistula_campaign(payload, lat=None, lng=None)
        r2 = handle_ciprb_fistula_campaign(payload, lat=None, lng=None)
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 200)   # deduped
        self.assertEqual(FistulaCampaign.objects.count(), 1)
