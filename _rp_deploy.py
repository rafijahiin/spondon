import os, sys, time, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'auFCf7bfBDtrP6xeW5F2KJ'              # CIPRB 10 — MPDSR Action Plan (LIVE)
XLSX = r'_ciprb_build/CIPRB-10_MPDSR_Response_Plan.xlsx'
asset_url = f'{API}/assets/{UID}/'

a = requests.get(asset_url + '?format=json', headers=H, timeout=90).json()
print('BEFORE rows=%d subs=%s active=%s' % (
    len(a['content']['survey']), a.get('deployment__submission_count'), a.get('deployment__active')))

# Re-import into the SAME asset (destination preserves uid / webhook / submissions).
with open(XLSX, 'rb') as f:
    files = {'file': (os.path.basename(XLSX), f,
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    r = requests.post(f'{API}/imports/', headers=H, files=files,
                      data={'destination': asset_url, 'assetUid': UID}, timeout=120)
print('import POST', r.status_code)
imp_url = r.json().get('url')
for _ in range(40):
    s = requests.get(imp_url + '?format=json', headers=H, timeout=60).json()
    if s.get('status') in ('complete', 'error'):
        print('import', s.get('status'))
        if s.get('status') == 'error':
            print(s.get('messages')); sys.exit(1)
        break
    time.sleep(2)

a2 = requests.get(asset_url + '?format=json', headers=H, timeout=90).json()
ver = a2.get('version_id')
rd = requests.patch(asset_url + 'deployment/', headers=H,
                    data={'active': 'true', 'version_id': ver}, timeout=120)
print('redeploy', rd.status_code)

a3 = requests.get(asset_url + '?format=json', headers=H, timeout=90).json()
print('AFTER  rows=%d subs=%s active=%s' % (
    len(a3['content']['survey']), a3.get('deployment__submission_count'), a3.get('deployment__active')))
links = a3.get('deployment__links') or {}
print('OFFLINE:', links.get('offline_url'))
print('PREVIEW:', links.get('preview_url'))
