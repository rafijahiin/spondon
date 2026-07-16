import os, sys, json, time, requests
sys.stdout.reconfigure(encoding='utf-8')
secret = (os.environ.get('KOBO_WEBHOOK_SECRET') or '').strip()
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
EP = 'https://web-production-091fa.up.railway.app/webhook/programs/form/ciprb_mpdsr_response_plan_v1/'
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'auFCf7bfBDtrP6xeW5F2KJ'
HK = {'Authorization': f'Token {secret}', 'Content-Type': 'application/json'}
HT = {'Authorization': f'Token {tok}'}
G = 'grp_new_plan'
AID = '2-001'   # Bhola (numeric code 2) + 3-digit serial

plan = {'_id': 999999300, 'ap_mode': 'new_plan', 'grp_meta/district': 'bhola',
        'grp_meta/collection_date': '2026-06-25', '_submitted_by': 'wiring_test',
        f'{G}/action_id': AID, f'{G}/rp_section': 'system_strengthening',
        f'{G}/act_activity': 'WIRING TEST numeric code — safe to delete',
        f'{G}/act_status': 'pending'}
r1 = requests.post(EP, headers=HK, data=json.dumps(plan), timeout=60)
print('1) register %s (Bhola) ->' % AID, r1.status_code, repr(r1.text[:44]))

time.sleep(15)
files = requests.get(f'{API}/assets/{UID}/files/?format=json', headers=HT, timeout=30).json().get('results', [])
csv_url = next((f.get('content') for f in files
                if (f.get('metadata') or {}).get('filename') == 'mpdsr_actions.csv'
                or f.get('description') == 'mpdsr_actions.csv'), None)
in_csv = False
if csv_url:
    c = requests.get(csv_url, headers=HT, timeout=30).text
    in_csv = any(line.split(',')[0].strip() == AID for line in c.splitlines())
    for line in c.splitlines():
        if AID in line:
            print('   csv row:', line[:78])
print('2) %s in update dropdown ->' % AID, in_csv)

upd = {'_id': 999999301, 'ap_mode': 'update_action', 'grp_meta/district': 'bhola',
       'grp_update/ap_action_sel': AID, 'grp_update/ap_new_status': 'dropped',
       'grp_update/ap_new_completion': '0', 'grp_update/ap_remarks': 'wiring test done'}
r2 = requests.post(EP, headers=HK, data=json.dumps(upd), timeout=60)
print('3) update %s ->' % AID, r2.status_code, repr(r2.text[:30]), '(dropped to clean up)')
