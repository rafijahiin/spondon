import os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///db.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
import django; django.setup()
from django.conf import settings as _s; _s.ALLOWED_HOSTS = ['*', 'testserver', 'localhost']
from reports.models import Report, ReportType

qs = Report.objects.filter(period_type='monthly', year=2026, month=6)
print('total pieces:', qs.count())
for r in qs.order_by('partner', 'report_type', 'format'):
    n = len(bytes(r.file_bytes or b''))
    print(f'  {(r.partner or "ALL"):7} {r.report_type:16} {r.format:5} {n:>8} bytes  '
          f'token={r.share_token[:14] or "—"}')

web = qs.filter(report_type=ReportType.WEB_REPORT).first()
from django.test import Client
c = Client()
resp = c.get(f'/r/{web.share_token}/')
body = resp.content
print('\ntoken route  ->', resp.status_code, resp.get('Content-Type'), len(body), 'bytes')
print('is web report ->', (b'Programme Pulse' in body) and (b'SIMPLE' in body))
bad = c.get('/r/not-a-real-token/')
print('bad token    ->', bad.status_code)
