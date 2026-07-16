import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
TOK = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {TOK}'}
API = 'https://kf.kobotoolbox.org/api/v2'
ANON = f'{API}/users/AnonymousUser/'
UIDS = [('Hijra', 'aBT7aCL9p4FGcW4WwXZcr6'), ('FSW', 'aVsJ7VJ35k8GshpQpnXygC')]

for name, uid in UIDS:
    for perm in ('view_asset', 'add_submissions'):
        r = requests.post(f'{API}/assets/{uid}/permission-assignments/', headers=H,
                          json={'user': ANON, 'permission': f'{API}/permissions/{perm}/'},
                          timeout=30)
        print(f'  {name} grant {perm} -> {r.status_code}')
    pa = requests.get(f'{API}/assets/{uid}/permission-assignments/?format=json',
                      headers=H, timeout=30).json()
    perms = {(' '.join([(a.get("permission") or "")]).rstrip('/').split('/')[-1])
             for a in pa if 'AnonymousUser' in (a.get('user') or '')}
    public = 'add_submissions' in perms and 'view_asset' in perms
    print(f'  {name}: anon perms = {sorted(perms)}  PUBLIC={public}\n')
