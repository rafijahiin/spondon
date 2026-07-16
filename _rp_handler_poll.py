import os, sys, json, time, requests
sys.stdout.reconfigure(encoding='utf-8')
secret = (os.environ.get('KOBO_WEBHOOK_SECRET') or '').strip()
EP = 'https://web-production-091fa.up.railway.app/webhook/programs/form/ciprb_mpdsr_response_plan_v1/'
HK = {'Authorization': f'Token {secret}', 'Content-Type': 'application/json'}
# no action_id → NEW handler: 400 'action_id required'; OLD handler: 200 'OK — 0 actions'
tp = {'_id': 999999100, 'ap_mode': 'new_plan', 'grp_meta/district': 'kurigram',
      '_submitted_by': 'deploy_probe'}
for i in range(9):
    try:
        r = requests.post(EP, headers=HK, data=json.dumps(tp), timeout=30)
        body = r.text[:50]
        new_live = (r.status_code == 400 and 'action_id' in body)
        print('try %d: %s %r -> new_handler=%s' % (i + 1, r.status_code, body, new_live))
        if new_live:
            print('NEW HANDLER LIVE')
            break
    except Exception as e:
        print('try %d: err %s' % (i + 1, e))
    if i < 8:
        time.sleep(25)
