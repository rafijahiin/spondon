import datetime

from cryptography.fernet import Fernet
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Organisation, Role, User
from submissions.models import FormType, KoboSubmission, SubmissionStatus

from .encryption import decrypt, encrypt
from .models import CaseStatus, FistulaCase

TEST_KEY = Fernet.generate_key().decode()
BASE_URL = '/api/fistula/'


def make_user(email, org, role):
    return User.objects.create_user(
        email=email, password='pass', full_name='Test', organisation=org, role=role,
    )


def make_submission(partner='PHD', kobo_id='k001'):
    # Use PENDING so the post_save signal does not auto-create the FistulaCase;
    # FromSubmissionTest tests the manager method directly.
    return KoboSubmission.objects.create(
        kobo_id=kobo_id,
        form_type=FormType.FISTULA,
        partner=partner,
        worker_name='Rina',
        district='Dhaka',
        region='Dhaka',
        submitted_at=timezone.now(),
        raw_data={'patient_name': 'Fatema Begum', 'patient_id': 'NID-001', 'age': '32'},
        status=SubmissionStatus.PENDING,
    )


@override_settings(FERNET_KEY=TEST_KEY)
def make_case(partner='PHD', status=CaseStatus.IDENTIFIED, follow_up_date=None,
              date_identified=None, kobo_id='k001'):
    from .encryption import encrypt as enc
    if date_identified is None:
        date_identified = datetime.date.today()
    return FistulaCase.objects.create(
        partner=partner,
        district='Dhaka',
        region='Dhaka',
        date_identified=date_identified,
        patient_name_enc=enc('Fatema Begum'),
        patient_id_enc=enc('NID-001'),
        age=32,
        status=status,
        follow_up_date=follow_up_date,
    )


# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

@override_settings(FERNET_KEY=TEST_KEY)
class FistulaCaseModelTest(TestCase):

    def test_case_hash_auto_generated(self):
        case = make_case()
        self.assertTrue(case.case_hash.startswith('FIS-PHD-'))

    def test_case_hash_sequential(self):
        c1 = make_case(kobo_id='k1')
        c2 = make_case(kobo_id='k2')
        self.assertNotEqual(c1.case_hash, c2.case_hash)

    def test_bondhu_hash_prefix(self):
        case = make_case(partner='Bondhu')
        self.assertIn('BON', case.case_hash)

    def test_patient_name_decrypted_via_property(self):
        from .encryption import encrypt as enc
        case = FistulaCase.objects.create(
            partner='PHD', district='Dhaka', region='Dhaka',
            date_identified=datetime.date.today(),
            patient_name_enc=enc('Nasrin Akter'),
            patient_id_enc=enc('NID-999'),
            age=28,
            status=CaseStatus.IDENTIFIED,
        )
        self.assertEqual(case.patient_name, 'Nasrin Akter')
        self.assertEqual(case.patient_id, 'NID-999')

    def test_is_overdue_past_date_non_completed(self):
        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        case = make_case(status=CaseStatus.FOLLOWUP_PENDING, follow_up_date=yesterday)
        self.assertTrue(case.is_overdue)

    def test_is_overdue_future_date(self):
        tomorrow = datetime.date.today() + datetime.timedelta(days=1)
        case = make_case(follow_up_date=tomorrow)
        self.assertFalse(case.is_overdue)

    def test_is_overdue_referral_completed_never_overdue(self):
        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        case = make_case(
            status=CaseStatus.REFERRAL_COMPLETED,
            follow_up_date=yesterday,
        )
        self.assertFalse(case.is_overdue)

    def test_is_overdue_no_follow_up_date(self):
        case = make_case(follow_up_date=None)
        self.assertFalse(case.is_overdue)

    def test_str(self):
        case = make_case()
        self.assertIn('PHD', str(case))
        self.assertIn('FIS-', str(case))


# ---------------------------------------------------------------------------
# get_or_create_from_submission
# ---------------------------------------------------------------------------

@override_settings(FERNET_KEY=TEST_KEY)
class FromSubmissionTest(TestCase):

    def test_creates_case_from_submission(self):
        sub = make_submission()
        case, created = FistulaCase.objects.get_or_create_from_submission(sub)
        self.assertTrue(created)
        self.assertEqual(case.partner, 'PHD')
        self.assertEqual(case.district, 'Dhaka')
        self.assertEqual(case.status, CaseStatus.IDENTIFIED)
        self.assertEqual(case.patient_name, 'Fatema Begum')
        self.assertEqual(case.patient_id, 'NID-001')
        self.assertEqual(case.age, 32)

    def test_idempotent_get_or_create(self):
        sub = make_submission()
        _, c1 = FistulaCase.objects.get_or_create_from_submission(sub)
        _, c2 = FistulaCase.objects.get_or_create_from_submission(sub)
        self.assertTrue(c1)
        self.assertFalse(c2)
        self.assertEqual(FistulaCase.objects.count(), 1)

    def test_missing_pii_fields_handled(self):
        sub = make_submission(kobo_id='k002')
        sub.raw_data = {}  # no patient_name, patient_id, age
        sub.save()
        case, _ = FistulaCase.objects.get_or_create_from_submission(sub)
        self.assertEqual(case.patient_name, '')
        self.assertIsNone(case.age)


# ---------------------------------------------------------------------------
# API — list and org isolation
# ---------------------------------------------------------------------------

@override_settings(FERNET_KEY=TEST_KEY)
class FistulaCaseAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.phd = make_user('pm@phd.org', Organisation.PHD, Role.MANAGER)
        self.bondhu = make_user('bm@bondhu.org', Organisation.BONDHU, Role.MANAGER)

    def test_unauthenticated_returns_403(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, 403)

    def test_phd_manager_sees_only_phd_cases(self):
        make_case(partner='PHD', kobo_id='k1')
        make_case(partner='Bondhu', kobo_id='k2')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['partner'], 'PHD')

    def test_bondhu_cannot_see_phd_cases(self):
        make_case(partner='PHD')
        self.client.force_authenticate(user=self.bondhu)
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.data['count'], 0)

    def test_detail_includes_patient_name(self):
        case = make_case(partner='PHD')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}{case.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['patient_name'], 'Fatema Begum')

    def test_bondhu_cannot_access_phd_detail(self):
        case = make_case(partner='PHD')
        self.client.force_authenticate(user=self.bondhu)
        resp = self.client.get(f'{BASE_URL}{case.id}/')
        self.assertEqual(resp.status_code, 404)

    def test_patch_updates_status(self):
        case = make_case(partner='PHD')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.patch(
            f'{BASE_URL}{case.id}/',
            {'status': CaseStatus.ACTION_REQUIRED},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        case.refresh_from_db()
        self.assertEqual(case.status, CaseStatus.ACTION_REQUIRED)

    def test_patch_follow_up_date(self):
        case = make_case(partner='PHD')
        future = str(datetime.date.today() + datetime.timedelta(days=7))
        self.client.force_authenticate(user=self.phd)
        resp = self.client.patch(
            f'{BASE_URL}{case.id}/',
            {'follow_up_date': future},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        case.refresh_from_db()
        self.assertEqual(str(case.follow_up_date), future)

    def test_patch_past_follow_up_date_rejected(self):
        case = make_case(partner='PHD')
        yesterday = str(datetime.date.today() - datetime.timedelta(days=1))
        self.client.force_authenticate(user=self.phd)
        resp = self.client.patch(
            f'{BASE_URL}{case.id}/',
            {'follow_up_date': yesterday},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_post_not_allowed(self):
        self.client.force_authenticate(user=self.phd)
        resp = self.client.post(BASE_URL, {}, format='json')
        self.assertEqual(resp.status_code, 405)

    def test_delete_not_allowed(self):
        case = make_case(partner='PHD')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.delete(f'{BASE_URL}{case.id}/')
        self.assertEqual(resp.status_code, 405)


# ---------------------------------------------------------------------------
# Overdue endpoint
# ---------------------------------------------------------------------------

@override_settings(FERNET_KEY=TEST_KEY)
class OverdueEndpointTest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.phd = make_user('pm@phd.org', Organisation.PHD, Role.MANAGER)

    def test_overdue_returns_only_overdue_cases(self):
        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        tomorrow = datetime.date.today() + datetime.timedelta(days=1)
        make_case(partner='PHD', follow_up_date=yesterday, status=CaseStatus.FOLLOWUP_PENDING, kobo_id='k1')
        make_case(partner='PHD', follow_up_date=tomorrow, kobo_id='k2')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}overdue/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)

    def test_completed_cases_not_overdue(self):
        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        make_case(
            partner='PHD',
            follow_up_date=yesterday,
            status=CaseStatus.REFERRAL_COMPLETED,
        )
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}overdue/')
        self.assertEqual(resp.data['count'], 0)

    def test_overdue_org_isolated(self):
        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        make_case(
            partner='Bondhu',
            follow_up_date=yesterday,
            status=CaseStatus.FOLLOWUP_PENDING,
        )
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}overdue/')
        self.assertEqual(resp.data['count'], 0)


# ---------------------------------------------------------------------------
# Stats endpoint
# ---------------------------------------------------------------------------

@override_settings(FERNET_KEY=TEST_KEY)
class StatsEndpointTest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.phd = make_user('pm@phd.org', Organisation.PHD, Role.MANAGER)

    def test_stats_keys_present(self):
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}stats/')
        self.assertEqual(resp.status_code, 200)
        for key in ('total', 'by_status', 'overdue', 'this_month'):
            self.assertIn(key, resp.data)

    def test_stats_counts_correctly(self):
        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        make_case(partner='PHD', status=CaseStatus.IDENTIFIED, kobo_id='k1')
        make_case(partner='PHD', status=CaseStatus.REFERRAL_COMPLETED, kobo_id='k2')
        make_case(
            partner='PHD',
            status=CaseStatus.FOLLOWUP_PENDING,
            follow_up_date=yesterday,
            kobo_id='k3',
        )
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}stats/')
        self.assertEqual(resp.data['total'], 3)
        self.assertEqual(resp.data['by_status']['identified'], 1)
        self.assertEqual(resp.data['by_status']['referral_completed'], 1)
        self.assertEqual(resp.data['overdue'], 1)

    def test_stats_org_isolated(self):
        make_case(partner='Bondhu')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}stats/')
        self.assertEqual(resp.data['total'], 0)
