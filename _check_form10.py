import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
try:
    from dotenv import load_dotenv; load_dotenv()
except Exception:
    pass

UID = 'auFCf7bfBDtrP6xeW5F2KJ'
BASE = 'https://kf.kobotoolbox.org/api/v2'
token = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
print('token present:', bool(token))
if not token:
    sys.exit('NO KOBO TOKEN locally — rerun with: railway run python _check_form10.py')
H = {'Authorization': f'Token {token}'}

a = requests.get(f'{BASE}/assets/{UID}/?format=json', headers=H, timeout=30).json()
print('name        :', a.get('name'))
print('deployed    :', a.get('has_deployment'), '| active:', a.get('deployment__active'))
print('submissions :', a.get('deployment__submission_count'))
cs = (a.get('content') or {}).get('settings') or {}
print('id_string   :', cs.get('id_string') if isinstance(cs, dict) else cs)

hk = requests.get(f'{BASE}/assets/{UID}/hooks/?format=json', headers=H, timeout=30).json()
hooks = hk.get('results', [])
print(f'\nHOOKS: {len(hooks)}')
for h in hooks:
    print(f"  name={h.get('name')!r} active={h.get('active')} failures={h.get('failures_count')}")
    print(f"     endpoint={h.get('endpoint')!r}")
    lg = requests.get(f"{BASE}/assets/{UID}/hooks/{h.get('uid')}/logs/?format=json&limit=5",
                      headers=H, timeout=30).json()
    for L in lg.get('results', [])[:5]:
        print(f"     log status={L.get('status_code')} tries={L.get('tries')} "
              f"msg={str(L.get('message'))[:110]}")

d = requests.get(f'{BASE}/assets/{UID}/data/?format=json&limit=3', headers=H, timeout=30).json()
subs = d.get('results', [])
print(f'\nSUBMISSIONS total={d.get("count")} showing={len(subs)}')
for s in subs:
    print('  _id', s.get('_id'), '| ap_mode:', s.get('ap_mode'),
          '| xform:', s.get('_xform_id_string'))
    rk = [k for k in s if 'grp_sys_act' in k or 'grp_community' in k or 'grp_facility' in k]
    print('     repeat keys:', rk)
    print('     district  :', {k: s[k] for k in s if k.endswith('district')})
