import os, sys, time, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
FORMS = {
    'Mother List':  'ar4muzSPxzhqd9XxVvWXjx',
    'Service Log':  'a7PgkrZcH8gMxqsdgkf6fF',
    'Activity/Ops': 'a6nEhvxFfDr2xPpcqnYw4f',
}

def hook_of(uid):
    hk = requests.get(f'{API}/assets/{uid}/hooks/?format=json', headers=H, timeout=40).json()
    return (hk.get('results') or [None])[0]

for name, uid in FORMS.items():
    hook = hook_of(uid)
    if not hook:
        print(f'\n{name}: NO HOOK'); continue
    hid = hook['uid']
    logs = requests.get(f'{API}/assets/{uid}/hooks/{hid}/logs/?format=json&limit=300',
                        headers=H, timeout=90).json()
    results = logs.get('results', [])
    failed = [l for l in results
              if str(l.get('status_str', '')).lower() == 'failed' or l.get('status') == 0]
    print(f'\n{name}: {len(results)} logs, {len(failed)} failed')
    for l in failed:
        print('  FAIL', l.get('uid'), l.get('date_modified'), 'tries', l.get('tries'),
              'code', l.get('status_code'), 'msg', (l.get('message') or '')[:150])
    if failed:
        r = requests.patch(f'{API}/assets/{uid}/hooks/{hid}/retry/', headers=H, timeout=120)
        print(f'  -> bulk retry: {r.status_code} {r.text[:150]}')
        if r.status_code not in (200, 201, 202):
            for l in failed:
                lr = requests.patch(f"{API}/assets/{uid}/hooks/{hid}/logs/{l['uid']}/retry/",
                                    headers=H, timeout=60)
                print(f"     log {l['uid']} retry -> {lr.status_code}")

print('\n--- waiting 20s for retries to process ---')
time.sleep(20)
for name, uid in FORMS.items():
    hook = hook_of(uid)
    if hook:
        print(f"{name}: ok={hook.get('success_count')} fail={hook.get('failed_count')} "
              f"pending={hook.get('pending_count')}")
