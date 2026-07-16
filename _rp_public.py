import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'auFCf7bfBDtrP6xeW5F2KJ'
ANON = f'{API}/users/AnonymousUser/'
for perm in ('view_asset', 'add_submissions'):
    r = requests.post(f'{API}/assets/{UID}/permission-assignments/', headers=H,
                      json={'user': ANON, 'permission': f'{API}/permissions/{perm}/'}, timeout=60)
    print(perm, r.status_code)
