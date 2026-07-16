import os, sys, time, requests
from pyxform.xls2xform import xls2xform_convert
sys.stdout.reconfigure(encoding='utf-8')

tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'

# Live Bandhu asset UIDs (confirmed by Enketo code + submission counts).
FORMS = [
    ('ar4muzSPxzhqd9XxVvWXjx', r'C:\Users\HP\Documents\koboforms\Bandhu-0_Mother_List.xlsx',        'Mother List'),
    ('a7PgkrZcH8gMxqsdgkf6fF', r'C:\Users\HP\Documents\koboforms\Bandhu-1_Service_Log.xlsx',         'Service Log'),
    ('a6nEhvxFfDr2xPpcqnYw4f', r'C:\Users\HP\Documents\koboforms\Bandhu-2_Activity_Operations.xlsx', 'Activity/Ops'),
]

for uid, xlsx, name in FORMS:
    print(f'\n=== {name}  {uid}')
    try:
        xls2xform_convert(xlsform_path=xlsx, xform_path=xlsx.replace('.xlsx', '.xml'), validate=False)
        print('  pyxform OK')
    except Exception as e:
        print('  PYXFORM ERROR:', repr(e)[:600]); continue

    with open(xlsx, 'rb') as fh:
        files = {'file': (os.path.basename(xlsx), fh,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        data = {'destination': f'{API}/assets/{uid}/', 'library': 'false'}
        ir = requests.post(f'{API}/imports/', headers=H, files=files, data=data, timeout=120)
    ir.raise_for_status(); ij = ir.json(); imp_url = ij.get('url') or f"{API}/imports/{ij['uid']}/"
    ok = False
    for _ in range(45):
        try:
            s = requests.get(imp_url, headers=H, timeout=40).json(); st = s.get('status')
        except Exception:
            time.sleep(2); continue
        if st == 'complete':
            ok = True; break
        if st in ('error', 'failed'):
            print('  IMPORT FAILED:', s.get('messages') or s); break
        time.sleep(2)
    if not ok:
        print('  import not complete; skip deploy'); continue

    v = requests.get(f'{API}/assets/{uid}/versions/?limit=1', headers=H, timeout=60).json()
    vid = v['results'][0]['uid']
    dr = requests.patch(f'{API}/assets/{uid}/deployment/', headers=H,
                        json={'version_id': vid, 'active': True}, timeout=90)
    a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=90).json()
    print(f"  redeploy={dr.status_code}  survey_rows_now={len(a.get('content', {}).get('survey', []))}"
          f"  subs_preserved={a.get('deployment__submission_count')}")
