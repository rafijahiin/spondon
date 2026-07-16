import os, requests, sys
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
KF = 'https://kf.kobotoolbox.org/api/v2/assets'
FORMS = [('HIJRA', 'aBT7aCL9p4FGcW4WwXZcr6', 'dc_hijra'), ('FSW', 'aVsJ7VJ35k8GshpQpnXygC', 'dc_fsw')]
HAVE = ['dc_code', 'submission_id', 'interview_start', 'interview_end', '_id_ts']
GONE = ['questionnaire_serial', 'interviewer_name_code', 'supervisor_name_code', 'start_time']

for label, uid, dclist in FORMS:
    a = requests.get(f'{KF}/{uid}/?format=json', headers=H, timeout=90).json()
    dep = a.get('deployed_version_id')
    dv = requests.get(f'{KF}/{uid}/versions/{dep}/?format=json', headers=H, timeout=90).json()
    content = dv.get('content') or {}
    survey = content.get('survey', [])
    choices = content.get('choices', [])
    names = {r.get('name') for r in survey}
    dc_codes = sorted([str(c.get('name')) for c in choices if c.get('list_name') == dclist], key=lambda x: int(x) if x.isdigit() else 0)
    print(f'=== {label}  deployed==latest:{dep == a.get("version_id")}  active:{a.get("deployment__active")} ===')
    for n in HAVE:
        print(f'  have {n}: {"OK" if n in names else "MISSING"}')
    for n in GONE:
        print(f'  gone {n}: {"OK" if n not in names else "STILL PRESENT"}')
    print(f'  {dclist} codes: {dc_codes}')
    print()
