import os, requests
TOKEN = (os.environ.get('KOBO_TOKEN') or os.environ.get('KOBO_API_TOKEN') or '').strip()
BASE = (os.environ.get('KOBO_API_URL') or 'https://kf.kobotoolbox.org').rstrip('/')
if not TOKEN:
    print("NO KOBO_TOKEN in env"); raise SystemExit(1)
H = {'Authorization': 'Token ' + TOKEN}
r = requests.get(BASE + '/api/v2/assets/?limit=300', headers=H, timeout=60)
print("assets-list http:", r.status_code)
res = r.json().get('results', [])
print("total assets:", len(res))
hooked = 0
for a in res:
    uid = a.get('uid'); name = a.get('name', '')
    active = a.get('deployment__active'); subs = a.get('deployment__submission_count')
    try:
        hr = requests.get(f"{BASE}/api/v2/assets/{uid}/hooks/", headers=H, timeout=60)
        hooks = hr.json().get('results', []) if hr.status_code == 200 else []
    except Exception as e:
        print(f"[{uid}] {name!r} hooks-err {e}"); continue
    if not hooks:
        continue
    hooked += 1
    print(f"\n[{uid}] {name!r}  active={active} subs={subs}")
    for h in hooks:
        print(f"   hook '{h.get('name')}' active={h.get('active')} endpoint={h.get('endpoint')}")
        print(f"        success={h.get('success_count')} failed={h.get('failed_count')} pending={h.get('pending_count')}")
        if h.get('failed_count') or h.get('pending_count'):
            try:
                lr = requests.get(f"{BASE}/api/v2/assets/{uid}/hooks/{h.get('uid')}/logs/?limit=3", headers=H, timeout=60)
                for lg in (lr.json().get('results', []) if lr.status_code == 200 else [])[:3]:
                    print(f"        LOG status={lg.get('status_code')} tries={lg.get('tries')} msg={str(lg.get('message'))[:180]}")
            except Exception as e:
                print("        log-err", e)
print(f"\nassets with hooks: {hooked}")
