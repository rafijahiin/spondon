import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
KF = 'https://kf.kobotoolbox.org/api/v2/assets'

CHECKS = {
    'aBT7aCL9p4FGcW4WwXZcr6': [
        ('q4_14', lambda r: r and "${q4_13}='1'" in r, "must contain ${q4_13}='1'"),
        ('q7_14', lambda r: r and r.count("_12mo}='1'") == 16, "must OR all 16 past-12mo items"),
    ],
    'aVsJ7VJ35k8GshpQpnXygC': [
        ('q3_11', lambda r: not r, "must have NO relevant"),
        ('q5_11', lambda r: not r, "must have NO relevant"),
    ],
}
NAMES = {'aBT7aCL9p4FGcW4WwXZcr6': 'HIJRA', 'aVsJ7VJ35k8GshpQpnXygC': 'FSW'}

allok = True
for uid, checks in CHECKS.items():
    a = requests.get(f'{KF}/{uid}/?format=json', headers=H, timeout=90).json()
    dep = a.get('deployed_version_id'); ver = a.get('version_id')
    dv = requests.get(f'{KF}/{uid}/versions/{dep}/?format=json', headers=H, timeout=90).json()
    survey = (dv.get('content') or {}).get('survey', [])
    relmap = {r.get('name'): r.get('relevant') for r in survey}
    print(f'=== {NAMES[uid]}  deployed=={dep==ver}  active={a.get("deployment__active")} ===')
    for name, ok, desc in checks:
        r = relmap.get(name)
        good = ok(r)
        allok = allok and good
        print(f'  [{"PASS" if good else "FAIL"}] {name}: {desc}')
        print(f'         deployed relevant = {r!r}')
    print()
print('ALL FIXES LIVE' if allok else 'SOMETHING WRONG — REVIEW')
