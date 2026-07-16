import os, requests, sys, json
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
uid = 'aBT7aCL9p4FGcW4WwXZcr6'
r0 = requests.get(f'https://kf.kobotoolbox.org/api/v2/assets/{uid}/?format=json', headers=H, timeout=90)
print('HTTP status:', r0.status_code, '| token set:', bool(tok), '| len:', len(tok))
print('body[:300]:', r0.text[:300].replace(chr(10), ' '))
a = r0.json() if r0.status_code == 200 else {}
print('version_id         :', a.get('version_id'))
print('deployed_version_id:', a.get('deployed_version_id'))
print('deployment__active :', a.get('deployment__active'))
print('has_deployment     :', a.get('has_deployment'))

def a213(survey, src):
    for r in survey:
        if r.get('name') == 'a213_nid_match':
            print(f'  [{src}] a213 relevant = {r.get("relevant")!r}')
            return
    print(f'  [{src}] a213 not found')

# latest content (draft)
a213(a.get('content', {}).get('survey', []), 'LATEST content')
# deployed version
dep = a.get('deployed_version_id')
dv = requests.get(f'https://kf.kobotoolbox.org/api/v2/assets/{uid}/versions/{dep}/?format=json', headers=H, timeout=90).json()
a213((dv.get('content') or {}).get('survey', []), 'DEPLOYED ver')

# count of q5_9-gated + a102-gated in latest content vs deployed
def counts(survey):
    return (sum(1 for r in survey if r.get('relevant')),
            sum(1 for r in survey if r.get('name') in ('q5_9','q5_10','q5_11','q5_9_count') and r.get('relevant')))
print('latest  content relevants, q5-gated:', counts(a.get('content', {}).get('survey', [])))
print('deployed ver     relevants, q5-gated:', counts((dv.get('content') or {}).get('survey', [])))
