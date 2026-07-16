import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
for label, uid in [('HIJRA', 'aBT7aCL9p4FGcW4WwXZcr6'), ('FSW', 'aVsJ7VJ35k8GshpQpnXygC')]:
    a = requests.get(f'https://kf.kobotoolbox.org/api/v2/assets/{uid}/?format=json',
                     headers=H, timeout=90).json()
    survey = a['content']['survey']
    label_rows = [r for r in survey if r.get('appearance') == 'label']
    still_req = [r for r in label_rows if r.get('required')]
    listnolabel = [r for r in survey if r.get('appearance') == 'list-nolabel']
    lnl_req = [r for r in listnolabel if r.get('required')]
    print(f'{label}: version={a.get("version_id")}')
    print(f'   matrix HEADER rows (appearance=label): {len(label_rows)} | still required: {len(still_req)}  <-- must be 0')
    print(f'   matrix ANSWER rows (list-nolabel): {len(listnolabel)} | required: {len(lnl_req)}  <-- should equal total')
    for r in survey:
        if r.get('name') in ('q2_1_hdr', 'q2_1_a', 'q2_1_b'):
            print(f'   {r.get("name"):10s} appearance={str(r.get("appearance")):12s} required={r.get("required")!r}')
    print()
