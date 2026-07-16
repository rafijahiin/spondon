import os, sys, time, requests
sys.stdout.reconfigure(encoding='utf-8')

tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
XLSX = r'_ciprb_build\CIPRB-2_MPDSR_Form_01_Community_Maternal.xlsx'
TITLE = 'PREVIEW — MPDSR Form 01 (Community Maternal) — rebuild for CIPRB review'

# 1. create a fresh preview-only asset (does NOT touch the live form)
r = requests.post(f'{API}/assets/', headers=H, json={
    'name': TITLE, 'asset_type': 'survey',
    'settings': {'description':
        'Preview-only rebuild of MPDSR Form 01 for CIPRB to check against the '
        'paper. No webhook, not for real data. Safe to delete.'},
}, timeout=60)
r.raise_for_status()
uid = r.json()['uid']
print('PREVIEW asset uid:', uid)

# 2. import the xlsx into it
with open(XLSX, 'rb') as fh:
    files = {'file': (os.path.basename(XLSX), fh,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    data = {'destination': f'{API}/assets/{uid}/', 'library': 'false'}
    ir = requests.post(f'{API}/imports/', headers=H, files=files, data=data, timeout=120)
ir.raise_for_status()
ij = ir.json()
imp_url = ij.get('url') or f"{API}/imports/{ij['uid']}/"

# 3. poll import status
status = None
for _ in range(40):
    s = requests.get(imp_url, headers=H, timeout=30).json()
    status = s.get('status')
    if status == 'complete':
        print('import complete')
        break
    if status in ('error', 'failed'):
        print('IMPORT FAILED:', s.get('messages') or s)
        sys.exit(1)
    time.sleep(2)
else:
    print('import still processing — status:', status)

# 4. deploy
v = requests.get(f'{API}/assets/{uid}/versions/?limit=1', headers=H, timeout=30).json()
try:
    vid = v['results'][0]['uid']
except Exception:
    print('no version yet'); sys.exit(1)
dr = requests.post(f'{API}/assets/{uid}/deployment/', headers=H,
                   json={'version_id': vid, 'active': True}, timeout=60)
if dr.status_code not in (200, 201):
    dr = requests.patch(f'{API}/assets/{uid}/deployment/', headers=H,
                        json={'version_id': vid, 'active': True}, timeout=60)
print('deploy status:', dr.status_code)

# 5. fetch the Enketo links + survey row count
a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=30).json()
links = a.get('deployment__links') or {}
print('--- ENKETO LINKS ---')
for k in ('preview_url', 'offline_url', 'url', 'single_url', 'iframe_url'):
    if links.get(k):
        print(f'{k}: {links[k]}')
survey = a.get('content', {}).get('survey', [])
print('survey rows:', len(survey))
