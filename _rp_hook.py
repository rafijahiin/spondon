import os, sys, json, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
secret = (os.environ.get('KOBO_WEBHOOK_SECRET') or '').strip()
APP_BASE = 'https://web-production-091fa.up.railway.app'
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'auFCf7bfBDtrP6xeW5F2KJ'
SLUG = 'ciprb_mpdsr_response_plan_v1'
NEW_EP = f'{APP_BASE}/webhook/programs/form/{SLUG}/'
if not tok or not secret:
    sys.exit('missing KOBO token or KOBO_WEBHOOK_SECRET')

# 1. confirm live form is repeat-based
a = requests.get(f'{API}/assets/{UID}/?format=json', headers=H, timeout=60).json()
names = [q.get('name') for q in a['content']['survey']]
print('live form: rows=%d grp_sys_act=%s ap_mode=%s ap_action_sel=%s a1slots=%s'
      % (len(names), 'grp_sys_act' in names, 'ap_mode' in names,
         'ap_action_sel' in names, any('_a1_' in str(n) for n in names)))

# 2. current hooks
hk = requests.get(f'{API}/assets/{UID}/hooks/?format=json', headers=H, timeout=30).json().get('results', [])
print('\ncurrent hooks:')
for h in hk:
    print('  ', h.get('uid'), 'active=%s' % h.get('active'), h.get('endpoint'))

# 3. deactivate every hook that is NOT the new programs endpoint (the old /webhook/kobo/)
for h in hk:
    if h.get('endpoint') != NEW_EP and h.get('active'):
        r = requests.patch(f'{API}/assets/{UID}/hooks/{h["uid"]}/', headers=H,
                           json={'active': False}, timeout=30)
        print('  deactivated old hook %s -> %s' % (h['uid'], r.status_code))

# 4. (re)create the programs hook
for h in hk:
    if h.get('endpoint') == NEW_EP:
        requests.delete(f'{API}/assets/{UID}/hooks/{h["uid"]}/', headers=H, timeout=30)
r = requests.post(f'{API}/assets/{UID}/hooks/', headers=H, json={
    'name': 'SIMPLE Railway (programs)',
    'endpoint': NEW_EP, 'active': True, 'export_type': 'json',
    'email_notification': False,
    'settings': {'custom_headers': {'Authorization': f'Token {secret}'}},
}, timeout=60)
print('\ncreate programs hook ->', r.status_code, NEW_EP)

# 5. verify
hk2 = requests.get(f'{API}/assets/{UID}/hooks/?format=json', headers=H, timeout=30).json().get('results', [])
print('\nhooks after:')
for h in hk2:
    print('  active=%s' % h.get('active'), h.get('endpoint'))

# 6. routing+auth test — empty new_plan → handler reached, 0 actions, no prod data
tp = {'_id': 999999001, 'ap_mode': 'new_plan', 'grp_meta/district': 'kurigram',
      '_submitted_by': 'wiring_test'}
tr = requests.post(NEW_EP, headers={'Authorization': f'Token {secret}',
                                    'Content-Type': 'application/json'},
                   data=json.dumps(tp), timeout=60)
print('\nrouting test (empty new_plan) ->', tr.status_code, repr(tr.text[:80]))
print('EXPECT 200 and "OK — 0 actions" = handler reached, auth ok, nothing created')
