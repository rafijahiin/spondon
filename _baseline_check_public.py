import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
H = {'Authorization': 'Token ' + (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '')}
API = 'https://kf.kobotoolbox.org/api/v2'
for name, uid in [('Hijra', 'aBT7aCL9p4FGcW4WwXZcr6'), ('FSW', 'aVsJ7VJ35k8GshpQpnXygC')]:
    a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=60).json()
    pa = requests.get(f'{API}/assets/{uid}/permission-assignments/', headers=H, timeout=60).json()
    perms = set()
    for x in pa:
        if 'AnonymousUser' in (x.get('user') or ''):
            perms.add((x.get('permission') or '').rstrip('/').split('/')[-1])
    public = ('add_submissions' in perms) and ('view_asset' in perms)
    print(f'{name}: active={a.get("deployment__active")}  anon={sorted(perms)}  PUBLIC={public}')
