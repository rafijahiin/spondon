import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
WANT = {'VO1m2jh1': 'mother_list', 'DMOqdJFx': 'service_log', 'WoHgXucH': 'activity_ops'}

url = f'{API}/assets/?format=json&limit=300'
cands, total = [], 0
while url:
    r = requests.get(url, headers=H, timeout=60).json()
    res = r.get('results', [])
    total += len(res)
    for a in res:
        nm = (a.get('name') or '')
        ids = (a.get('settings', {}) or {}).get('id_string') or ''
        if 'andhu' in nm.lower() or 'bandhu' in ids.lower():
            cands.append(a)
    url = r.get('next')

print('total assets in account:', total, '| bandhu-ish:', len(cands))
for a in cands:
    uid = a['uid']
    off = ''
    try:
        d = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=60).json()
        off = (d.get('deployment__links') or {}).get('offline_url') or ''
    except Exception:
        off = '(detail timeout)'
    match = next((v for k, v in WANT.items() if k in off), '')
    print(f"  uid={uid} subs={a.get('deployment__submission_count')} deployed={a.get('has_deployment')} "
          f"MATCH={match!r} id_string={(a.get('settings',{}) or {}).get('id_string')!r} "
          f"name={a.get('name','')[:34]!r}")
