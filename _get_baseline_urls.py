import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
for label, uid in [('HIJRA', 'aBT7aCL9p4FGcW4WwXZcr6'), ('FSW', 'aVsJ7VJ35k8GshpQpnXygC')]:
    a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=90).json()
    links = a.get('deployment__links', {})
    print(f'{label}: {a.get("name")}')
    print(f'  URL:  {links.get("url")}')
    print(f'  Subs: {a.get("deployment__submission_count")}')
    survey = a.get('content', {}).get('survey', [])
    visible = [r for r in survey if r.get('type') not in ('start','end','begin_group','end_group','calculate','note','begin group','end group')]
    print(f'  Qs: {len(visible)}')
    for r in visible:
        lab = r.get('label')
        lab = lab[0] if isinstance(lab, list) and lab else lab
        nm = r.get('name','')
        print(f'    [{r.get("type")}] {nm} | {lab}')
    print()
