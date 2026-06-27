import os, sys, time, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
if not tok:
    print('ERROR: KOBO_API_TOKEN (or KOBO_TOKEN) env var is not set.')
    sys.exit(1)
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
UID, XLSX = sys.argv[1], sys.argv[2]
asset_url = f'{API}/assets/{UID}/'

resp = requests.get(asset_url + '?format=json', headers=H, timeout=90)
a = resp.json()
if 'content' not in a:
    print(f'ERROR fetching asset (HTTP {resp.status_code}): {a}')
    sys.exit(1)
print('BEFORE rows=%d subs=%s active=%s' % (
    len(a['content']['survey']), a.get('deployment__submission_count'), a.get('deployment__active')))

# Upload with up to 5 retries — Kobo can drop connections on large POSTs
r = None
for attempt in range(1, 6):
    try:
        with open(XLSX, 'rb') as f:
            files = {'file': (os.path.basename(XLSX), f,
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            r = requests.post(f'{API}/imports/', headers=H, files=files,
                              data={'destination': asset_url, 'assetUid': UID}, timeout=120)
        print(f'import POST {r.status_code} (attempt {attempt})')
        break
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
        print(f'upload attempt {attempt} failed: {e}')
        if attempt == 5:
            print('All upload attempts failed.'); sys.exit(1)
        time.sleep(5 * attempt)

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
rd = requests.patch(asset_url + 'deployment/', headers=H,
                    data={'active': 'true', 'version_id': a2.get('version_id')}, timeout=120)
print('redeploy', rd.status_code)
a3 = requests.get(asset_url + '?format=json', headers=H, timeout=90).json()
print('AFTER  rows=%d subs=%s active=%s' % (
    len(a3['content']['survey']), a3.get('deployment__submission_count'), a3.get('deployment__active')))
