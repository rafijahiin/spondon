import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
if not tok:
    print('NO_TOKEN'); sys.exit(1)
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
target = 'ciprb_fistula_campaign_v1'
found = []
url = f'{API}/assets/?format=json&limit=200'
while url:
    r = requests.get(url, headers=H, timeout=90).json()
    for a in r.get('results', []):
        ids = (a.get('settings', {}) or {}).get('id_string') or ''
        # id_string not always in list view; match on name too
        name = a.get('name', '')
        if target in (a.get('uid',''), ids) or 'Fistula Campaign' in name or 'fistula_campaign' in name.lower():
            found.append((a.get('uid'), name, a.get('deployment__active'),
                          a.get('deployment__submission_count')))
    url = r.get('next')
print('MATCHES:', len(found))
for uid, name, active, subs in found:
    print(f'  uid={uid} | active={active} | subs={subs} | name={name!r}')
