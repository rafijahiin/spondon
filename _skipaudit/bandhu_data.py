import os, requests, sys
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
KF = 'https://kf.kobotoolbox.org/api/v2/assets'

SERVICE_LOG = 'a7PgkrZcH8gMxqsdgkf6fF'
MOTHER_LIST = 'ar4muzSPxzhqd9XxVvWXjx'


def fetch_all(uid):
    out = []
    url = f'{KF}/{uid}/data/?format=json&limit=30000'
    while url:
        r = requests.get(url, headers=H, timeout=120).json()
        out.extend(r.get('results', []))
        url = r.get('next')
    return out

print('=== SERVICE LOG (a7Pg) — record_type distribution ===')
sl = fetch_all(SERVICE_LOG)
print(f'total service-log submissions: {len(sl)}')
rt = Counter()
for s in sl:
    # record_type may be nested under group or bare
    val = s.get('record_type') or s.get('grp_meta/record_type')
    if not val:
        for k, v in s.items():
            if k.endswith('record_type'):
                val = v; break
    rt[val or '(none)'] += 1
for k, v in rt.most_common():
    print(f'   {k:24} {v}')

print('\n=== MOTHER LIST (ar4m) — count + field sample ===')
ml = fetch_all(MOTHER_LIST)
print(f'total mother-list submissions: {len(ml)}')
if ml:
    keys = [k for k in ml[0].keys() if not k.startswith('_') and '/' in k or k.startswith('ml') or 'ml_' in k]
    print('   sample record fields (ml_*):')
    for k, v in ml[0].items():
        if 'ml_' in k or k in ('record_type',):
            print(f'      {k} = {v!r}')
