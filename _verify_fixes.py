import os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///db.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
import django; django.setup()

# 1. pharmacy serializer now locks the forgeable fields
from pharmacy.serializers import PrescriptionRecordSerializer
f = PrescriptionRecordSerializer().fields
print('FIX1 pharmacy read-only  partner=%s approval_status=%s prescribed_by=%s'
      % (f['partner'].read_only, f['approval_status'].read_only, f['prescribed_by'].read_only))

# 2. write-gate on the three viewsets
from programs.views import ClientViewSet, ServiceCenterViewSet
from pharmacy.views import PrescriptionRecordViewSet
def perms(vs): return [p.__name__ for p in vs.permission_classes]
print('FIX2 Client=%s  ServiceCenter=%s  Prescription=%s'
      % (perms(ClientViewSet), perms(ServiceCenterViewSet), perms(PrescriptionRecordViewSet)))
print('     org-pin perform_create present:',
      'perform_create' in vars(ClientViewSet) and 'perform_create' in vars(ServiceCenterViewSet))

# 3. webhook 500-strand guards — object/null _geolocation must NOT crash
from submissions.views import _geolocation as sub_geo
from programs.webhook import _geolocation as prog_geo
print('FIX3 _geolocation(object) sub=%s prog=%s (want (None, None))'
      % (sub_geo({'_geolocation': {'lat': 1}}), prog_geo({'_geolocation': {'0': 1}})))
print('     _geolocation(valid list):', sub_geo({'_geolocation': [23.7, 90.4]}))

# webhook non-dict body guard, end-to-end via the test client (no signature path:
# a list body is rejected at the isinstance check before any handler)
from django.test import Client as TC
from django.test.utils import override_settings
with override_settings(ALLOWED_HOSTS=['*', 'testserver']):
    import json
    c = TC()
    r = c.post('/webhook/kobo/', data=json.dumps([1, 2, 3]), content_type='application/json')
    print('     POST list body -> status %s (want 400/403, NOT 500)' % r.status_code)
