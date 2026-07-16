import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
TOK = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {TOK}'}
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'aBT7aCL9p4FGcW4WwXZcr6'
url = f'{API}/assets/{UID}/'
a = requests.get(url + '?format=json', headers=H, timeout=90).json()
print('has_deployment=%s version_id=%s rows=%s' % (
    a.get('has_deployment'), a.get('version_id'),
    len(a.get('content', {}).get('survey', []))))
r = requests.post(url + 'deployment/', headers=H,
                  data={'active': 'true', 'version_id': a.get('version_id')}, timeout=120)
print('POST deployment ->', r.status_code)
print(r.text[:1500])
if r.status_code >= 400:
    r2 = requests.patch(url + 'deployment/', headers=H,
                        data={'active': 'true', 'version_id': a.get('version_id')}, timeout=120)
    print('PATCH deployment ->', r2.status_code)
    print(r2.text[:1500])
