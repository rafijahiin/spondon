import datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Organisation, Role, User
from submissions.models import FormType, KoboSubmission, SubmissionStatus
from .duplicate_detector import check_new_survey, flag_duplicates_for_partner
from .models import BaselineSurvey, SurveyType

BASE_URL = '/api/baseline/'


def make_user(email, org, role):
    return User.objects.create_user(
        email=email, password='pass', full_name='Test', organisation=org, role=role,
    )


def make_survey(partner='PHD', survey_type=SurveyType.BASELINE,
                participant_code='P001', district='Dhaka', date=None):
    if date is None:
        date = datetime.date.today()
    return BaselineSurvey.objects.create(
        partner=partner,
        district=district,
        region='Dhaka',
        survey_type=survey_type,
        participant_code=participant_code,
        date_conducted=date,
        raw_data={},
    )


# ---------------------------------------------------------------------------
# Duplicate detection unit tests
# ---------------------------------------------------------------------------

class DuplicateDetectorTest(TestCase):

    def test_no_duplicates_when_unique(self):
        make_survey(participant_code='P001')
        make_survey(participant_code='P002')
        flagged = flag_duplicates_for_partner('PHD')
        self.assertEqual(flagged, 0)

    def test_flags_duplicate_same_participant(self):
        make_survey(participant_code='P001')
        make_survey(participant_code='P001')
        flagged = flag_duplicates_for_partner('PHD')
        self.assertEqual(flagged, 1)

    def test_different_survey_types_not_duplicate(self):
        make_survey(participant_code='P001', survey_type=SurveyType.BASELINE)
        make_survey(participant_code='P001', survey_type=SurveyType.ENDLINE)
        flagged = flag_duplicates_for_partner('PHD')
        self.assertEqual(flagged, 0)

    def test_check_new_survey_marks_duplicate(self):
        original = make_survey(participant_code='P001')
        new_survey = make_survey(participant_code='P001')
        is_dup = check_new_survey(new_survey)
        self.assertTrue(is_dup)
        new_survey.refresh_from_db()
        self.assertTrue(new_survey.is_duplicate)
        self.assertEqual(new_survey.duplicate_of, original)

    def test_empty_participant_code_never_flagged(self):
        make_survey(participant_code='')
        make_survey(participant_code='')
        flagged = flag_duplicates_for_partner('PHD')
        self.assertEqual(flagged, 0)


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------

class BaselineSurveyAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.phd = make_user('pm@phd.org', Organisation.PHD, Role.MANAGER)
        self.bondhu = make_user('bm@bondhu.org', Organisation.BONDHU, Role.MANAGER)

    def test_unauthenticated_returns_403(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, 403)

    def test_org_isolation(self):
        make_survey(partner='PHD')
        make_survey(partner='Bondhu')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.data['count'], 1)

    def test_filter_by_survey_type(self):
        make_survey(partner='PHD', survey_type=SurveyType.BASELINE, participant_code='P1')
        make_survey(partner='PHD', survey_type=SurveyType.ENDLINE, participant_code='P2')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}?survey_type=endline')
        self.assertEqual(resp.data['count'], 1)

    def test_stats_endpoint(self):
        make_survey(partner='PHD', survey_type=SurveyType.BASELINE, participant_code='P1')
        make_survey(partner='PHD', survey_type=SurveyType.ENDLINE, participant_code='P2')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.get(f'{BASE_URL}stats/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total'], 2)
        self.assertEqual(resp.data['baseline'], 1)
        self.assertEqual(resp.data['endline'], 1)

    def test_scan_duplicates_action(self):
        make_survey(partner='PHD', participant_code='P001')
        make_survey(partner='PHD', participant_code='P001')
        self.client.force_authenticate(user=self.phd)
        resp = self.client.post(f'{BASE_URL}scan_duplicates/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['flagged'], 1)
