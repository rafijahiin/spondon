"""Does the DEPLOYED version (what KoboCollect actually downloads) carry the
skip logic? Compare asset content vs the deployed version's content."""
import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
KF = 'https://kf.kobotoolbox.org/api/v2/assets'

for label, uid in [('HIJRA', 'aBT7aCL9p4FGcW4WwXZcr6'), ('FSW', 'aVsJ7VJ35k8GshpQpnXygC')]:
    a = requests.get(f'{KF}/{uid}/?format=json', headers=H, timeout=90).json()
    ver = a.get('version_id')
    dep = a.get('deployed_version_id')
    active = a.get('deployment__active')
    content_rel = sum(1 for r in a['content']['survey'] if r.get('relevant'))
    print(f'=== {label} ===')
    print(f'  latest content version_id : {ver}')
    print(f'  deployed_version_id       : {dep}')
    print(f'  deployment active         : {active}')
    print(f'  relevant in latest content: {content_rel}')

    # fetch the DEPLOYED version's content
    if dep:
        dv = requests.get(f'{KF}/{uid}/versions/{dep}/?format=json', headers=H, timeout=90).json()
        survey = (dv.get('content') or {}).get('survey', [])
        dep_rel = sum(1 for r in survey if r.get('relevant'))
        print(f'  relevant in DEPLOYED ver  : {dep_rel}   <-- what the phone downloads')
        print(f'  >>> {"MATCH — phone gets skip logic" if dep_rel == content_rel else "STALE — deployed differs from content!"}')
    print()
