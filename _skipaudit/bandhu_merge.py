import os, requests, sys
from collections import Counter
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

def short(k): return k.split('/')[-1]
def get(row, name):
    for k, v in row.items():
        if short(k) == name:
            return v
    return None

sl = fetch_all(SL)
ml = fetch_all(ML)
log = [s for s in sl if str(get(s, 'record_type') or '') == 'wellness_logbook']

# ---- 1. FIELD DIFFERENCE ----
ml_f = {short(k) for r in ml[:80] for k in r if short(k).startswith('ml') and not short(k).startswith('ml_serial')}
lg_f = {short(k) for r in log[:80] for k in r if short(k).startswith('log')}
print('MOTHER LIST captures (WHO — demographics, 1 per person):')
print('  ', sorted(ml_f))
print('F-01 LOGBOOK captures (WHAT — services, per visit):')
print('  ', sorted(lg_f))
print('Only real shared concept: client ID + TG code. No demographic overlap.')

# ---- 2. GRANULARITY ----
ml_ids = [str(get(r, 'ml_id_no') or '').strip().upper() for r in ml]
ml_ids = [i for i in ml_ids if i]
lg_ids = [str(get(r, 'log_client_id') or '').strip().upper() for r in log]
lg_ids = [i for i in lg_ids if i]
print(f'\nGRANULARITY:')
print(f'  Mother List : {len(ml)} rows, {len(set(ml_ids))} distinct people  -> {len(ml)-len(set(ml_ids))} duplicate registrations')
print(f'  F-01 Logbook: {len(log)} rows, {len(set(lg_ids))} distinct people -> avg {len(log)/max(len(set(lg_ids)),1):.1f} service rows/person')

# ---- 3. JOIN / MERGE FEASIBILITY ----
ml_set = set(ml_ids)
lg_set = set(lg_ids)
orphan_rows = sum(1 for i in lg_ids if i not in ml_set)
orphan_people = len(lg_set - ml_set)
served = len(lg_set & ml_set)
registered_never_served = len(ml_set - lg_set)
print(f'\nJOIN on client ID (the only link):')
print(f'  logbook rows that MATCH a registered mother : {len(lg_ids)-orphan_rows} / {len(lg_ids)}')
print(f'  logbook rows that CANNOT join (unregistered): {orphan_rows}  ({orphan_people} distinct unknown IDs)')
print(f'  registered people WITH >=1 logbook service  : {served}')
print(f'  registered people with NO logbook service   : {registered_never_served}')
# sample a few orphan IDs
print('  sample unregistered logbook IDs:', sorted(lg_set - ml_set)[:8])
