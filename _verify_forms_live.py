import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'

FORMS = [
    ('CIPRB-6 Social Autopsy', 'a6vQiCJ3tz4MRxKqdMHCbA', 'সামাজিক মৃত্যু পর্যালোচনা রিপোর্টিং ফর্ম'),
    ('CIPRB-7 Slip 01 (community)', 'aSnEgQT6DUooVanZXubhAF', 'কমিউনিটিতে প্রযোজ্য'),
    ('CIPRB-8 Slip 02 (hospital)', 'aaCnfRHHgkukkhDgXwUnXX', 'হাসপাতাল প্রযোজ্য'),
]
print('=== KOBO — live deployed forms ===')
for name, uid, probe in FORMS:
    a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=60).json()
    survey = a.get('content', {}).get('survey', [])
    labels = ' '.join(str(q.get('label', '')) for q in survey)
    has = probe in labels
    print(f'  {name}')
    print(f'    active={a.get("deployment__active")} · deployed_version={a.get("deployed_version_id","")[:10]}'
          f' · subs={a.get("deployment__submission_count")} · rows={len(survey)}')
    print(f'    verbatim "{probe[:32]}…": {"PRESENT" if has else "MISSING"}')

print('\n=== PROD — dashboard endpoint deployed? ===')
for base in ['https://web-production-091fa.up.railway.app', 'https://simpledashboard.pro']:
    try:
        r = requests.get(base + '/api/mpdsr/action-aggregates/', timeout=20, allow_redirects=False)
        verdict = ('DEPLOYED (auth-gated)' if r.status_code in (401, 403)
                   else 'NOT YET (404 = still building)' if r.status_code == 404
                   else f'status {r.status_code}')
        print(f'  {base} → {r.status_code} · {verdict}')
    except Exception as e:
        print(f'  {base} → error {type(e).__name__}')
