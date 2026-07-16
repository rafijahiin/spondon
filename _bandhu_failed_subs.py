import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'a7PgkrZcH8gMxqsdgkf6fF'  # Service Log

hk = requests.get(f'{API}/assets/{UID}/hooks/?format=json', headers=H, timeout=40).json()
hid = hk['results'][0]['uid']
logs = requests.get(f'{API}/assets/{UID}/hooks/{hid}/logs/?format=json&limit=300',
                    headers=H, timeout=90).json().get('results', [])
failed = [l for l in logs if l.get('status') == 0 or str(l.get('status_str', '')).lower() == 'failed']
print(f'{len(failed)} failed logs on Service Log\n')

ID_KEYS = ['pr_client_id', 'htc_client_id', 'gbv_client_id', 'mh_client_id',
           'cn_client_id', 'rf_id_no', 'hv_client_uid']
for l in failed:
    sid = l.get('submission_id') or l.get('instance_id') or l.get('uuid')
    print(f"log {l['uid']}  submission_id={sid}  date={l.get('date_modified')}")
    if not sid:
        print('   (no submission id on log)'); continue
    try:
        d = requests.get(f'{API}/assets/{UID}/data/{sid}/?format=json', headers=H, timeout=60).json()
    except Exception as e:
        print('   fetch error', e); continue
    rt = d.get('record_type')
    who = d.get('_submitted_by')
    when = d.get('_submission_time')
    cid = next((d.get(k) for k in ID_KEYS if d.get(k)), None)
    datakeys = sorted([k for k in d.keys() if not k.startswith('_') and k not in ('formhub/uuid', 'meta/instanceID')])
    print(f"   record_type={rt!r}  client_id={cid!r}  by={who!r}  at={when}")
    print(f"   field_keys({len(datakeys)}): {datakeys[:25]}")
    print()
