import os, requests, sys, json
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
if not tok:
    print('NO TOKEN'); sys.exit(0)
H = {'Authorization': f'Token {tok}'}

FORMS = {'Hijra': 'aBT7aCL9p4FGcW4WwXZcr6', 'FSW': 'aVsJ7VJ35k8GshpQpnXygC'}

for name, uid in FORMS.items():
    a = requests.get(f'https://kf.kobotoolbox.org/api/v2/assets/{uid}/?format=json',
                     headers=H, timeout=90).json()
    survey = (a.get('content') or {}).get('survey') or []
    names = [str(r.get('name') or '') for r in survey]
    print(f'\n===== {name} ({uid}) =====')
    print('  deployed_version:', a.get('deployed_version_id'))
    print('  version_count:', a.get('version_count'), '| date_modified:', a.get('date_modified'))
    print('  deployment_status:', a.get('has_deployment'), a.get('deployment__active'))
    links = a.get('deployment__links') or {}
    print('  preview url:', links.get('preview') or links.get('offline_url') or links.get('url'))
    # STALE CHECK — are my Stage-2 markers present in the DEPLOYED survey?
    markers = ['dc_code', 'interview_start', 'interview_end', 'submission_id', '_id_ts']
    print('  STAGE-2 MARKERS:', {m: (m in names) for m in markers})
    # NK point locations
    def show(nm):
        for r in survey:
            if str(r.get('name') or '') == nm:
                return {'type': r.get('type'), 'relevant': r.get('relevant'),
                        'choice': r.get('select_from_list_name')}
        return 'ABSENT'
    for q in ['a211', 'a212', 'a213', 'q2_13', 'q9_9', 'c3']:
        print(f'  {q}:', show(q))
    # date-type fields (three-dates check)
    dates = [(str(r.get('name')), r.get('type')) for r in survey
             if str(r.get('type') or '') in ('date', 'today', 'start', 'end', 'datetime')]
    print('  DATE/TIME fields:', dates)
