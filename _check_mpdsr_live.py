import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'

# LIVE MPDSR forms (from _form_versions.py) and the verbatim-rebuild PREVIEW assets.
GROUPS = {
    'LIVE': {
        'F01 Community Maternal':  'apvPk7qq94nry2aW3z7y4H',
        'F02 Community Neonatal':  'awQXeYhuLoLrM38fwSrF8y',
        'F04 Facility Maternal':   'aVQbxhGnDHNCe6AazSJByM',
        'F05 Facility Neonatal':   'a6pg47mTt8E56igHnK8SSD',
    },
    'PREVIEW (verbatim rebuild)': {
        'F01': 'aw8xKSWWtu6dwufnJ7U6nZ',
        'F02': 'a4YTSxLktHCz7hxQWgR9bA',
        'F04': 'anPvMncGuE8y3xf57dfBUj',
        'F05': 'aigdayRPEE8BNTW5re2Nvp',
    },
}
for grp, forms in GROUPS.items():
    print(f'\n===== {grp} =====')
    for name, uid in forms.items():
        try:
            a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=90).json()
            rows = len(a.get('content', {}).get('survey', []))
            print(f'  {name:26} uid={uid}  rows={rows}  active={a.get("deployment__active")}  subs={a.get("deployment__submission_count")}')
        except Exception as e:
            print(f'  {name:26} uid={uid}  ERROR {repr(e)[:60]}')
