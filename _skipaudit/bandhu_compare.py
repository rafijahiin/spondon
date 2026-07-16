import os, requests, sys
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
KF = 'https://kf.kobotoolbox.org/api/v2/assets'
SL, ML = 'a7PgkrZcH8gMxqsdgkf6fF', 'ar4muzSPxzhqd9XxVvWXjx'


def fetch_all(uid):
    out, url = [], f'{KF}/{uid}/data/?format=json&limit=30000'
    while url:
        r = requests.get(url, headers=H, timeout=120).json()
        out.extend(r.get('results', []))
        url = r.get('next')
    return out

sl = fetch_all(SL)
ml = fetch_all(ML)

def short(k):
    return k.split('/')[-1]

# field sets
log_rows = [s for s in sl if (s.get('record_type') or '').endswith('wellness_logbook') or any(str(v).endswith('wellness_logbook') for k, v in s.items() if k.endswith('record_type'))]
log_fields = set()
for s in log_rows[:50]:
    for k in s:
        if not short(k).startswith('_') and short(k).startswith('log'):
            log_fields.add(short(k))
ml_fields = set()
for s in ml[:50]:
    for k in s:
        if short(k).startswith('ml'):
            ml_fields.add(short(k))

print('F-01 LOGBOOK fields:', sorted(log_fields))
print()
print('MOTHER LIST fields :', sorted(ml_fields))

# ID overlap: are logbook client IDs registered in the Mother List?
ml_ids = set()
for s in ml:
    for k, v in s.items():
        if short(k) == 'ml_id_no' and v:
            ml_ids.add(str(v).strip().upper())
log_ids = []
for s in log_rows:
    for k, v in s.items():
        if short(k) == 'log_client_id' and v:
            log_ids.append(str(v).strip().upper())
matched = sum(1 for i in log_ids if i in ml_ids)
print(f'\nMother List registered IDs: {len(ml_ids)}')
print(f'F-01 logbook rows with an ID: {len(log_ids)}')
print(f'  logbook IDs that MATCH a registered mother: {matched}')
print(f'  logbook IDs NOT in mother list (would stub): {len(log_ids) - matched}')
print(f'  distinct logbook client IDs: {len(set(log_ids))}')
