import os, sys, time, requests, openpyxl
from pyxform.xls2xform import xls2xform_convert
sys.stdout.reconfigure(encoding='utf-8')

tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'

FORMS = [
    {'key': 'f02', 'uid': 'a4YTSxLktHCz7hxQWgR9bA',
     'xlsx': r'_ciprb_build\CIPRB-3_MPDSR_Form_02_Community_Neonatal.xlsx',
     'title': 'PREVIEW — MPDSR Form 02 (Community Neonatal) — CIPRB review (all questions shown)'},
    {'key': 'f04', 'uid': 'anPvMncGuE8y3xf57dfBUj',
     'xlsx': r'_ciprb_build\CIPRB-4_MPDSR_Form_04_Facility_Maternal.xlsx',
     'title': 'PREVIEW — MPDSR Form 04 (Facility Maternal) — CIPRB review (all questions shown)'},
    {'key': 'f05', 'uid': 'aigdayRPEE8BNTW5re2Nvp',
     'xlsx': r'_ciprb_build\CIPRB-5_MPDSR_Form_05_Facility_Neonatal.xlsx',
     'title': 'PREVIEW — MPDSR Form 05 (Facility Neonatal) — CIPRB review (all questions shown)'},
]

results = []
for f in FORMS:
    print('\n===', f['key'])
    flat = f['xlsx'].replace('.xlsx', '_flat.xlsx')
    wb = openpyxl.load_workbook(f['xlsx'])
    ws = wb['survey']
    hdr = [c.value for c in ws[1]]
    if 'relevant' in hdr:
        ci = hdr.index('relevant') + 1
        for r in range(2, ws.max_row + 1):
            ws.cell(r, ci).value = None
    wb.save(flat)
    try:
        xls2xform_convert(xlsform_path=flat, xform_path=flat.replace('.xlsx', '.xml'), validate=False)
        print('  pyxform OK')
    except Exception as e:
        print('  PYXFORM ERROR:', repr(e)[:400]); continue

    uid = f['uid']   # reuse existing preview asset so the link stays the same
    with open(flat, 'rb') as fh:
        files = {'file': (os.path.basename(flat), fh,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        data = {'destination': f'{API}/assets/{uid}/', 'library': 'false'}
        ir = requests.post(f'{API}/imports/', headers=H, files=files, data=data, timeout=120)
    ir.raise_for_status(); ij = ir.json(); imp_url = ij.get('url') or f"{API}/imports/{ij['uid']}/"
    ok = False
    for _ in range(40):
        s = requests.get(imp_url, headers=H, timeout=30).json(); st = s.get('status')
        if st == 'complete':
            ok = True; break
        if st in ('error', 'failed'):
            print('  IMPORT FAILED:', s.get('messages') or s); break
        time.sleep(2)
    if not ok:
        continue
    v = requests.get(f'{API}/assets/{uid}/versions/?limit=1', headers=H, timeout=30).json()
    vid = v['results'][0]['uid']
    dr = requests.post(f'{API}/assets/{uid}/deployment/', headers=H,
                       json={'version_id': vid, 'active': True}, timeout=60)
    if dr.status_code not in (200, 201):
        dr = requests.patch(f'{API}/assets/{uid}/deployment/', headers=H,
                            json={'version_id': vid, 'active': True}, timeout=60)
    for perm in ('view_asset', 'add_submissions'):
        requests.post(f'{API}/assets/{uid}/permission-assignments/', headers=H, json={
            'user': f'{API}/users/AnonymousUser/',
            'permission': f'{API}/permissions/{perm}/'}, timeout=30)
    a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=30).json()
    links = a.get('deployment__links') or {}
    rows = len(a.get('content', {}).get('survey', []))
    print(f"  uid={uid}  rows={rows}  deploy={dr.status_code}")
    print(f"  LINK: {links.get('url')}")
    results.append((f['key'], uid, rows, links.get('url')))

print('\n===== SUMMARY =====')
for k, uid, rows, url in results:
    print(f'{k}: {rows} questions  {url}  (uid {uid})')
