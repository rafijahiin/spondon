import os, requests, sys
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
uid = 'aBT7aCL9p4FGcW4WwXZcr6'
a = requests.get(f'https://kf.kobotoolbox.org/api/v2/assets/{uid}/?format=json', headers=H, timeout=90).json()
dep = a.get('deployed_version_id')
dv = requests.get(f'https://kf.kobotoolbox.org/api/v2/assets/{uid}/versions/{dep}/?format=json', headers=H, timeout=90).json()
survey = (dv.get('content') or {}).get('survey', [])
rel = {r.get('name'): r.get('relevant') for r in survey}
print('deployed==latest:', dep == a.get('version_id'), '| active:', a.get('deployment__active'))
allok = True
for k in ['a213_nid_match', 'q5_9_count', 'q5_9', 'q5_10', 'q5_11', 'q7_2_a_ever', 'q7_2_e_ever', 'q7_3_a_ever', 'q7_3_e_ever']:
    v = rel.get(k)
    ok = bool(v)
    allok = allok and ok
    print(f'  [{"OK" if ok else "MISS"}] {k}: {v!r}')
print('STAGE 1 LIVE' if allok else 'STILL MISSING')
