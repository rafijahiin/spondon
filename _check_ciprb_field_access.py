import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
USER = 'ciprb_field'
FORMS = {
    'MPDSR F01 Comm Mat':  'apvPk7qq94nry2aW3z7y4H',
    'MPDSR F02 Comm Neo':  'awQXeYhuLoLrM38fwSrF8y',
    'MPDSR F04 Fac Mat':   'aVQbxhGnDHNCe6AazSJByM',
    'MPDSR F05 Fac Neo':   'a6pg47mTt8E56igHnK8SSD',
    'Fistula Q Bank (1)':  'aH86Euq2AeJ8S9VYdry4PC',
    'Fistula Campaign':    'aso6xsUo8PMYRCzGQBc8Cm',
    'Action Plan (10)':    'auFCf7bfBDtrP6xeW5F2KJ',
    'Social Autopsy (6)':  'a6vQiCJ3tz4MRxKqdMHCbA',
    'Notif Slip 01 (7)':   'aSnEgQT6DUooVanZXubhAF',
    'Notif Slip 02 (8)':   'aaCnfRHHgkukkhDgXwUnXX',
    'Near Miss (9)':       'aTzdRTvhZ8yUQCGhA8UG5R',
}
for name, uid in FORMS.items():
    try:
        r = requests.get(f'{API}/assets/{uid}/permission-assignments/',
                         headers={**H, 'Accept': 'application/json'}, timeout=60)
        data = r.json() if r.status_code == 200 else []
        items = data if isinstance(data, list) else data.get('results', [])
        perms = set()
        for a in items:
            uname = (a.get('user', '') or '').split('?')[0].rstrip('/').rsplit('/', 1)[-1]
            if uname == USER:
                pname = (a.get('permission', '') or '').split('?')[0].rstrip('/').rsplit('/', 1)[-1]
                perms.add(pname)
        ok = ('add_submissions' in perms) and ('view_asset' in perms)
        print(f'  {name:20} {"OK" if ok else "** MISSING **":13} {sorted(perms) if perms else "(no access)"}')
    except Exception as e:
        print(f'  {name:20} ERROR {repr(e)[:45]}')
