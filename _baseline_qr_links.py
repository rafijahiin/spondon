import os, sys, json, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
FORMS = {'hijra': 'aBT7aCL9p4FGcW4WwXZcr6', 'fsw': 'aVsJ7VJ35k8GshpQpnXygC'}
out = {}
for pop, uid in FORMS.items():
    a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=90).json()
    links = a.get('deployment__links', {}) or {}
    out[pop] = {
        'name': a.get('name'),
        'active': a.get('deployment__active'),
        'links': links,
    }
    print(f"=== {pop}: {a.get('name')} (active={a.get('deployment__active')}) ===")
    for k, v in links.items():
        print(f"   {k}: {v}")
    print()
with open(os.path.join(os.path.dirname(__file__), '_baseline_qr_links.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
