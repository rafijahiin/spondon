import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
B = 'https://kf.kobotoolbox.org/api/v2'

FORMS = {
    'Form 01 Community Maternal': 'apvPk7qq94nry2aW3z7y4H',
    'Form 02 Community Neonatal': 'awQXeYhuLoLrM38fwSrF8y',
    'Form 04 Facility Maternal':  'aVQbxhGnDHNCe6AazSJByM',
    'Form 05 Facility Neonatal':  'a6pg47mTt8E56igHnK8SSD',
}

def fields(content):
    out = []
    for r in content.get('survey', []):
        nm = r.get('name')
        if not nm:
            continue
        lab = r.get('label')
        if isinstance(lab, list):
            lab = lab[0] if lab else ''
        out.append((nm, r.get('type', ''), (lab or '')[:40]))
    return out

for nm, uid in FORMS.items():
    r = requests.get(f'{B}/assets/{uid}/versions/?format=json&limit=15', headers=H, timeout=40)
    vers = r.json().get('results', [])
    print(f'\n=== {nm}  ({uid}) — {len(vers)} versions ===')
    for v in vers[:8]:
        print('   ', v.get('uid'), '|', v.get('date_modified') or v.get('date_deployed'))
    if len(vers) >= 2:
        v0 = requests.get(f'{B}/assets/{uid}/versions/{vers[0]["uid"]}/?format=json', headers=H, timeout=40).json()
        v1 = requests.get(f'{B}/assets/{uid}/versions/{vers[1]["uid"]}/?format=json', headers=H, timeout=40).json()
        f0 = {x[0] for x in fields(v0.get('content', {}))}
        f1 = {x[0] for x in fields(v1.get('content', {}))}
        print(f'   LATEST (my re-import) fields: {len(f0)}   |   PREVIOUS fields: {len(f1)}')
        print('   removed by my re-import (in PREV, not LATEST):', sorted(f1 - f0))
        print('   added   by my re-import (in LATEST, not PREV):', sorted(f0 - f1))
