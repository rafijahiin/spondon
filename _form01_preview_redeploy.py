import os, sys, time, requests, openpyxl
sys.stdout.reconfigure(encoding='utf-8')

tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
BUILT = r'_ciprb_build\CIPRB-2_MPDSR_Form_01_Community_Maternal.xlsx'
FLAT = r'_ciprb_build\_form01_preview_flat.xlsx'
UID = 'aw8xKSWWtu6dwufnJ7U6nZ'   # existing preview asset — keep same link

# Make a REVIEW copy that shows EVERY question (clear skip logic so nothing hides)
wb = openpyxl.load_workbook(BUILT)
ws = wb['survey']
hdr = [c.value for c in ws[1]]
ci = hdr.index('relevant') + 1
cleared = 0
for r in range(2, ws.max_row + 1):
    if ws.cell(r, ci).value:
        ws.cell(r, ci).value = None
        cleared += 1
wb.save(FLAT)
print(f'cleared {cleared} skip-logic rules so all questions show')

with open(FLAT, 'rb') as fh:
    files = {'file': (os.path.basename(FLAT), fh,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    data = {'destination': f'{API}/assets/{UID}/', 'library': 'false'}
    ir = requests.post(f'{API}/imports/', headers=H, files=files, data=data, timeout=120)
ir.raise_for_status()
ij = ir.json(); imp_url = ij.get('url') or f"{API}/imports/{ij['uid']}/"
for _ in range(40):
    s = requests.get(imp_url, headers=H, timeout=30).json(); st = s.get('status')
    if st == 'complete':
        print('import complete'); break
    if st in ('error', 'failed'):
        print('IMPORT FAILED:', s.get('messages') or s); sys.exit(1)
    time.sleep(2)

v = requests.get(f'{API}/assets/{UID}/versions/?limit=1', headers=H, timeout=30).json()
vid = v['results'][0]['uid']
dr = requests.patch(f'{API}/assets/{UID}/deployment/', headers=H,
                    json={'version_id': vid, 'active': True}, timeout=60)
print('redeploy status:', dr.status_code)

for perm in ('view_asset', 'add_submissions'):
    requests.post(f'{API}/assets/{UID}/permission-assignments/', headers=H, json={
        'user': f'{API}/users/AnonymousUser/',
        'permission': f'{API}/permissions/{perm}/',
    }, timeout=30)

a = requests.get(f'{API}/assets/{UID}/?format=json', headers=H, timeout=30).json()
links = a.get('deployment__links') or {}
print('PUBLIC LINK:', links.get('url'))
print('survey rows:', len(a.get('content', {}).get('survey', [])))
