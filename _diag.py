import datetime
from django.conf import settings
from django.apps import apps
from django.utils import timezone
from django.db.models import Count

print("SETTINGS:", settings.SETTINGS_MODULE)
print("DB host:", settings.DATABASES['default'].get('HOST'))
now = timezone.now()
wk = now - datetime.timedelta(days=14)
print("NOW:", now.isoformat())

print("\n=== Bandhu rows by model: approval_status breakdown + recent14d ===")
allrows = []
for m in apps.get_app_config('programs').get_models():
    fnames = {f.name for f in m._meta.get_fields() if hasattr(f, 'name')}
    if not ({'organisation', 'approval_status'} <= fnames):
        continue
    base = m.objects.filter(organisation='Bandhu')
    n = base.count()
    if not n:
        continue
    by = {d['approval_status']: d['c'] for d in base.values('approval_status').annotate(c=Count('id'))}
    rec = base.filter(created_at__gte=wk).count() if 'created_at' in fnames else '-'
    print(f"  {m.__name__:26} total={n:5} {by}  recent14d={rec}")
    if 'created_at' in fnames:
        for r in base.order_by('-created_at')[:6]:
            allrows.append((r.created_at, m.__name__, r.approval_status))

print("\n=== latest 14 Bandhu rows (newest first) ===")
allrows.sort(reverse=True)
for dt, mn, st in allrows[:14]:
    print(f"  {dt.isoformat()}  {mn:24} {st}")

print("\n=== Bandhu queue candidates (PENDING / MANAGER_APPROVED) ===")
anyq = False
for m in apps.get_app_config('programs').get_models():
    fnames = {f.name for f in m._meta.get_fields() if hasattr(f, 'name')}
    if {'organisation', 'approval_status'} <= fnames:
        p = m.objects.filter(organisation='Bandhu', approval_status='PENDING').count()
        ma = m.objects.filter(organisation='Bandhu', approval_status='MANAGER_APPROVED').count()
        if p or ma:
            anyq = True
            print(f"  {m.__name__:26} PENDING={p} MANAGER_APPROVED={ma}")
if not anyq:
    print("  (no Bandhu rows in PENDING or MANAGER_APPROVED — nothing for the queue)")
