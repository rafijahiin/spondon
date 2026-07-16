import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'

FORMS = {
    'Mother List (F-1.1)':   'ar4muzSPxzhqd9XxVvWXjx',
    'Service Log (F-01..08)': 'a7PgkrZcH8gMxqsdgkf6fF',
    'Activity/Ops (F-04..14)': 'a6nEhvxFfDr2xPpcqnYw4f',
}

for name, uid in FORMS.items():
    a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=90).json()
    active = a.get('deployment__active')
    rows = len(a.get('content', {}).get('survey', []))
    subs = a.get('deployment__submission_count')
    links = a.get('deployment__links') or {}
    hk = requests.get(f'{API}/assets/{uid}/hooks/?format=json', headers=H, timeout=40).json()
    hooks = hk.get('results', [])
    print(f'\n{name}  {uid}')
    print(f'  deployed_active={active}  survey_rows={rows}  submissions={subs}')
    print(f'  collect_url={links.get("offline_url")}')
    if not hooks:
        print('  !! NO WEBHOOK — submissions will NOT reach SIMPLE')
    for h in hooks:
        print(f'  webhook: active={h.get("active")}  ok={h.get("success_count")} fail={h.get("failed_count")}  endpoint={h.get("endpoint")}')
