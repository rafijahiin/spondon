import os, sys, json, time, requests
sys.stdout.reconfigure(encoding='utf-8')
secret = (os.environ.get('KOBO_WEBHOOK_SECRET') or '').strip()
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
EP = 'https://web-production-091fa.up.railway.app/webhook/programs/form/ciprb_mpdsr_response_plan_v1/'
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'auFCf7bfBDtrP6xeW5F2KJ'
HK = {'Authorization': f'Token {secret}', 'Content-Type': 'application/json'}
HT = {'Authorization': f'Token {tok}'}
P = 'grp_new_plan/grp_sys_strengthen/grp_sys_act'

# 1. new_plan with one action → expect "OK — 1 actions", mints a KU-NN id
plan = {'_id': 999999002, 'ap_mode': 'new_plan', 'grp_meta/district': 'kurigram',
        'grp_meta/collection_date': '2026-06-24', '_submitted_by': 'wiring_test',
        P: [{P + '/sys_activity': 'WIRING TEST — safe to delete',
             P + '/sys_status': 'pending'}]}
r1 = requests.post(EP, headers=HK, data=json.dumps(plan), timeout=60)
print('1) new_plan      ->', r1.status_code, repr(r1.text[:40]))

# 2. let the post_save signal sync mpdsr_actions.csv + redeploy
time.sleep(15)

# 3. read the CSV attached to the form → confirm the test id appears
files = requests.get(f'{API}/assets/{UID}/files/?format=json', headers=HT, timeout=30).json().get('results', [])
csv_url = next((f.get('content') for f in files
                if (f.get('metadata') or {}).get('filename') == 'mpdsr_actions.csv'
                or f.get('description') == 'mpdsr_actions.csv'), None)
test_id = None
if csv_url:
    c = requests.get(csv_url, headers=HT, timeout=30).text
    print('2) mpdsr_actions.csv (head):')
    for line in c.splitlines()[:6]:
        print('     ', line)
    for line in c.splitlines():
        if 'WIRING TEST' in line:
            test_id = line.split(',')[0].strip()
else:
    print('2) mpdsr_actions.csv NOT attached')
print('3) test action id in CSV ->', test_id)

# 4. update_action by that id → proves "update later via Kobo" (and drops the test row)
if test_id:
    upd = {'_id': 999999003, 'ap_mode': 'update_action', 'grp_meta/district': 'kurigram',
           'ap_action_sel': test_id.lower(), 'ap_new_status': 'dropped',
           'ap_new_completion': '0', 'ap_remarks': 'wiring test — dropping'}
    r2 = requests.post(EP, headers=HK, data=json.dumps(upd), timeout=60)
    print('4) update_action ->', r2.status_code, repr(r2.text[:40]), '(dropped, leaves the dropdown)')
