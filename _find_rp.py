import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'

# List all assets; show MPDSR / Response-Plan related ones.
r = requests.get(f'{API}/assets/?format=json&limit=400', headers=H, timeout=120).json()
rows = r.get('results', [])
print(f'total assets: {len(rows)}')
for a in rows:
    name = a.get('name') or ''
    if any(k in name for k in ('MPDSR', 'Response', 'Plan', 'CIPRB', 'Maternal', 'Neonatal', 'Death', 'Autopsy', 'Notification', 'Near')):
        print(f"  {name[:48]:48} uid={a.get('uid')}  active={a.get('deployment__active')}  subs={a.get('deployment__submission_count')}")
