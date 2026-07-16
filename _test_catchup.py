import os, sys, time
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///db.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test'); os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
import django; django.setup()
from django.core.cache import cache
from reports.models import Report
from reports.views import _kickoff_monthly_catchup

# previous month relative to today (2026-06-24) = May 2026
Report.objects.filter(period_type='monthly', year=2026, month=5).delete()
cache.delete('hub_monthly_autocheck')
print('May 2026 pieces before:', Report.objects.filter(period_type='monthly', year=2026, month=5).count())

_kickoff_monthly_catchup()           # spawns a background daemon thread
time.sleep(42)                        # let the thread render + persist

n = Report.objects.filter(period_type='monthly', year=2026, month=5).count()
print('May 2026 pieces after:', n)
print('RESULT:', 'PASS — background thread generated the set' if n == 10 else f'CHECK — got {n}')
