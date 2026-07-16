import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'aso6xsUo8PMYRCzGQBc8Cm'
r = requests.get(f'{API}/assets/{UID}/hooks/?format=json', headers=H, timeout=60).json()
hooks = r.get('results', [])
print('HOOKS:', len(hooks))
for h in hooks:
    print(f"  active={h.get('active')} | endpoint={h.get('endpoint')} | name={h.get('name')!r}")
