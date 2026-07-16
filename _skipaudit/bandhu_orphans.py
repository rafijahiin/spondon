import os, requests, sys
from collections import Counter, defaultdict
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

# registered IDs and centre->district-code map (from the DD- prefix of registered IDs)
ml_ids = set()
centre_dd = defaultdict(Counter)
for r in ml:
    cid = str(get(r, 'ml_id_no') or '').strip().upper()
    centre = str(get(r, 'centre_id') or get(r, 'centre') or '').strip()
    if cid:
        ml_ids.add(cid)
        if '-' in cid and centre:
            centre_dd[centre][cid.split('-')[0]] += 1
centre_code = {c: cnt.most_common(1)[0][0] for c, cnt in centre_dd.items()}

clean = format_typo = recovered = still_orphan = has_dash_orphan = 0
recover_examples = []
still_examples = []
for r in log:
    raw = str(get(r, 'log_client_id') or '').strip().upper()
    centre = str(get(r, 'centre_id') or get(r, 'centre') or '').strip()
    if not raw:
        continue
    if raw in ml_ids:
        clean += 1
        continue
    # orphan — try to repair
    if '-' not in raw and raw.isdigit():
        format_typo += 1
        dd = centre_code.get(centre)
        cand = f'{dd}-{raw.zfill(4)}' if dd else None
        if cand and cand in ml_ids:
            recovered += 1
            if len(recover_examples) < 6:
                recover_examples.append(f'{raw} @ {centre[-12:]} -> {cand} OK')
        else:
            still_orphan += 1
            if len(still_examples) < 6:
                still_examples.append(f'{raw} @ {centre[-14:]} -> {cand} (not registered)')
    else:
        has_dash_orphan += 1  # already DD- form but not found

print(f'logbook rows: {len(log)}')
print(f'  already matching a registered mother   : {clean}')
print(f'  bare-serial format typos               : {format_typo}')
print(f'     -> RECOVERABLE by adding district code: {recovered}')
print(f'     -> still not found after repair       : {still_orphan}')
print(f'  DD- form but ID not registered          : {has_dash_orphan}')
print(f'\nCentre -> district code map: {centre_code}')
print('\nRecovered examples:'); [print('   ', e) for e in recover_examples]
print('Still-orphan examples:'); [print('   ', e) for e in still_examples]
