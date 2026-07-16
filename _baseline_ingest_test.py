import os, sys, json
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///_baseline_ingest.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
os.environ['KOBO_WEBHOOK_SECRET'] = 'testsecret'
import django; django.setup()
from django.conf import settings as S
S.ALLOWED_HOSTS = ['*', 'testserver']
from django.core.management import call_command
call_command('migrate', verbosity=0, interactive=False)

from django.test import Client
from submissions.models import KoboSubmission, FormType, SubmissionStatus
from baseline.models import BaselineResponse, BaselineSurvey

KoboSubmission.objects.all().delete()
BaselineResponse.objects.all().delete()
BaselineSurvey.objects.all().delete()

c = Client()
HDR = {'HTTP_AUTHORIZATION': 'Token testsecret', 'content_type': 'application/json'}


def post(payload):
    return c.post('/webhook/kobo/', data=json.dumps(payload), **HDR)


def hijra(_id, serial, gps=True):
    p = {'_id': _id, '_xform_id_string': 'ciprb_baseline_hijra_v1',
         '_submission_time': '2026-06-25T10:00:00',
         'population': 'hijra', 'survey_round': 'baseline',
         'questionnaire_serial': serial, 'district': 'sunamganj',
         'cluster_site_code': 'CL-01', 's2_age': '24', 'c3': '1'}
    if gps:
        p['_geolocation'] = [25.07, 91.40]
    return p


# 1. Ingest WITHOUT GPS → must NOT 400 for baseline; lands PENDING, partner CIPRB.
r = post(hijra('b1', 'HJ-001', gps=False))
sub = KoboSubmission.objects.filter(kobo_id='b1').first()
print('1) status=%s  sub.status=%s partner=%s lat=%s' % (
    r.status_code, sub.status if sub else None,
    sub.partner if sub else None, sub.latitude if sub else None))
assert r.status_code == 201 and sub.status == SubmissionStatus.PENDING
assert sub.partner == 'CIPRB' and sub.latitude is None
assert BaselineResponse.objects.count() == 0  # no materialisation until approved

# 2. CIPRB approves → BaselineResponse materialises (verified record).
sub.status = SubmissionStatus.APPROVED
sub.save()
br = BaselineResponse.objects.filter(submission=sub).first()
print('2) BaselineResponse pop=%s serial=%s district=%s dup=%s' % (
    br.population, br.serial, br.district, br.is_duplicate))
assert br.population == 'hijra' and br.serial == 'HJ-001' and not br.is_duplicate

# 3. Second interview, SAME serial → approve → flagged duplicate.
post(hijra('b2', 'HJ-001', gps=True))
sub2 = KoboSubmission.objects.get(kobo_id='b2')
sub2.status = SubmissionStatus.APPROVED
sub2.save()
br2 = BaselineResponse.objects.get(submission=sub2)
print('3) second serial=%s dup=%s duplicate_of=%s' % (
    br2.serial, br2.is_duplicate, br2.duplicate_of_id))
assert br2.is_duplicate and br2.duplicate_of_id == br.id

# 4. Legacy generic BaselineSurvey must NOT be created for these instruments.
print('4) BaselineSurvey count=%d (want 0)  BaselineResponse count=%d (want 2)' % (
    BaselineSurvey.objects.count(), BaselineResponse.objects.count()))
assert BaselineSurvey.objects.count() == 0 and BaselineResponse.objects.count() == 2

# 5. GPS present on a normal MPDSR-less form still works (sanity): baseline w/ GPS.
r3 = post(hijra('b3', 'HJ-002', gps=True))
s3 = KoboSubmission.objects.get(kobo_id='b3')
print('5) gps-present status=%s lat=%s' % (r3.status_code, s3.latitude))
assert r3.status_code == 201 and s3.latitude is not None

print('\nALL BACKEND INGESTION CHECKS PASSED ✓')
