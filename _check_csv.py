import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'auFCf7bfBDtrP6xeW5F2KJ'
H = {'Authorization': f'Token {tok}'}

# 1. the ap_action_sel field definition in the live survey
a = requests.get(f'{API}/assets/{UID}/?format=json', headers=H, timeout=60).json()
for q in a['content']['survey']:
    if q.get('name') == 'ap_action_sel':
        print('ap_action_sel: type=%r appearance=%r' % (q.get('type'), q.get('appearance')))

# 2. the CSV that backs the dropdown — what IDs does it actually list?
files = requests.get(f'{API}/assets/{UID}/files/?format=json', headers=H, timeout=30).json().get('results', [])
csv_url = next((f.get('content') for f in files
                if (f.get('metadata') or {}).get('filename') == 'mpdsr_actions.csv'
                or f.get('description') == 'mpdsr_actions.csv'), None)
print('\nmpdsr_actions.csv attached:', bool(csv_url))
if csv_url:
    c = requests.get(csv_url, headers=H, timeout=30).text
    lines = c.splitlines()
    print('rows (incl header):', len(lines))
    for ln in lines[:12]:
        print('   ', ln)
