import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'aso6xsUo8PMYRCzGQBc8Cm'
a = requests.get(f'{API}/assets/{UID}/?format=json', headers=H, timeout=90).json()
print('NAME:', a.get('name'))
print('id_string:', (a.get('settings') or {}).get('id_string') or a.get('deployment__identifier','?'))
print('active:', a.get('deployment__active'), '| subs:', a.get('deployment__submission_count'))
print('enketo url:', a.get('deployment__links', {}).get('url'))
print('enketo preview:', a.get('deployment__links', {}).get('preview_url'))
survey = a['content']['survey']
qs = [r.get('label', [r.get('name')]) for r in survey if r.get('type') not in ('start','end','begin_group','end_group','calculate','note','geopoint','begin group','end group')]
print('\nLIVE DATA QUESTIONS (%d):' % len(qs))
for r in survey:
    if r.get('type') in ('begin_group','end_group','calculate','start','end','begin group','end group'):
        continue
    lab = r.get('label')
    lab = lab[0] if isinstance(lab, list) and lab else lab
    print(f"  [{r.get('type')}] {lab}")
# hooks
h = requests.get(f'{API}/assets/{UID}/hooks/?format=json', headers=H, timeout=60).json()
print('\nWEBHOOK(S):')
for hk in h.get('results', []):
    print('  active=%s endpoint=%s' % (hk.get('active'), hk.get('endpoint')))
