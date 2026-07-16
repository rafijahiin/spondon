import os, sys, json
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///_baseline_verify.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
os.environ['KOBO_WEBHOOK_SECRET'] = 'testsecret'
import django; django.setup()
from django.conf import settings as S
S.ALLOWED_HOSTS = ['*', 'testserver']
from django.core.management import call_command
call_command('migrate', verbosity=0, interactive=False)

from django.test import Client
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from submissions.models import KoboSubmission, SubmissionStatus
from baseline.models import BaselineResponse

U = get_user_model()
U.objects.all().delete(); KoboSubmission.objects.all().delete(); BaselineResponse.objects.all().delete()


def mkuser(email, role, org):
    u = U(email=email, role=role, organisation=org)
    if hasattr(u, 'username'):
        u.username = email.split('@')[0]
    u.set_password('x'); u.save(); return u


dev = mkuser('dev@x.com', 'developer', 'CIPRB')
mgr = mkuser('mgr@x.com', 'manager', 'PHD')
print('1) capability — dev.can_access_mpdsr=%s  mgr.can_access_mpdsr=%s'
      % (dev.can_access_mpdsr, mgr.can_access_mpdsr))

# Ingest a PENDING hijra baseline via the webhook.
c = Client()
payload = {'_id': 'v1', '_xform_id_string': 'ciprb_baseline_hijra_v1',
           '_submission_time': '2026-06-25T10:00:00', '_geolocation': [25.0, 91.4],
           'population': 'hijra', 'survey_round': 'baseline',
           'questionnaire_serial': 'HJ-900', 'district': 'sunamganj',
           'cluster_site_code': 'CL-9', 's2_age': '27', 'c3': '1'}
c.post('/webhook/kobo/', data=json.dumps(payload),
       HTTP_AUTHORIZATION='Token testsecret', content_type='application/json')
sub = KoboSubmission.objects.get(kobo_id='v1')
print('2) ingested status=%s (want pending)' % sub.status)

# CIPRB dev: sees the pending queue.
api = APIClient(); api.force_authenticate(dev)
r = api.get('/api/baseline/verification/')
items = r.json() if r.status_code == 200 else []
print('3) dev pending list -> %s, items=%d, serial=%s'
      % (r.status_code, len(items), items[0]['serial'] if items else None))

# CIPRB dev: approve -> materialises BaselineResponse.
ra = api.post('/api/baseline/verification/%s/approve/' % sub.id, {}, format='json')
sub.refresh_from_db()
print('4) approve -> %s, sub.status=%s, BaselineResponse=%d'
      % (ra.status_code, sub.status, BaselineResponse.objects.count()))

# Verified-responses + stats endpoints.
rs = api.get('/api/baseline/responses/stats/')
print('5) stats ->', rs.status_code, rs.json())

# PHD manager: blocked from the CIPRB-owned baseline verification.
api2 = APIClient(); api2.force_authenticate(mgr)
rb = api2.get('/api/baseline/verification/')
print('6) PHD manager pending list -> %s (want 403)' % rb.status_code)

ok = (sub.status == SubmissionStatus.APPROVED
      and BaselineResponse.objects.count() == 1
      and r.status_code == 200 and len(items) == 1
      and rb.status_code == 403 and dev.can_access_mpdsr and not mgr.can_access_mpdsr)
print('\nVERIFICATION API CHECKS:', 'PASS ✓' if ok else 'FAIL ✗')
sys.exit(0 if ok else 2)
