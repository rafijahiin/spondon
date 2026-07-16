import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}', 'Accept': 'application/json'}
API = 'https://kf.kobotoolbox.org/api/v2'
FORMS = {'HIJRA': 'aBT7aCL9p4FGcW4WwXZcr6', 'FSW': 'aVsJ7VJ35k8GshpQpnXygC'}


def getj(url):
    r = requests.get(url, headers=H, timeout=60)
    if r.status_code != 200:
        return None, f'HTTP {r.status_code}: {r.text[:120]}'
    try:
        return r.json(), None
    except Exception as e:
        return None, f'non-JSON: {r.text[:120]}'


for label, uid in FORMS.items():
    a, err = getj(f'{API}/assets/{uid}.json')
    if err:
        print(f'=== {label} ({uid}): {err} ===\n')
        continue
    print(f'=== {label}: {a.get("name")} ===')
    print(f'   owner: {a.get("owner__username")} | deployed(active): {a.get("deployment__active")}')
    pa, perr = getj(f'{API}/assets/{uid}/permission-assignments.json')
    if perr:
        print(f'   permission-assignments error: {perr}\n')
        continue
    byuser = {}
    for p in pa:
        user = (p.get('user') or '').rstrip('/').split('/')[-1]
        perm = (p.get('permission') or '').rstrip('/').split('/')[-1]
        byuser.setdefault(user, []).append(perm)
    for user, perms in sorted(byuser.items()):
        flag = '  <-- baseline89' if user == 'baseline89' else ''
        print(f'   {user}: {sorted(set(perms))}{flag}')
    if 'baseline89' not in byuser:
        print('   >>> baseline89 is NOT shared on this form <<<')
    print()
