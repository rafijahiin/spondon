import os, sys, requests, openpyxl
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'koboforms_baseline')

FORMS = [
    ('HIJRA', 'aBT7aCL9p4FGcW4WwXZcr6', 'CIPRB_Baseline_Hijra.xlsx'),
    ('FSW',   'aVsJ7VJ35k8GshpQpnXygC', 'CIPRB_Baseline_FSW.xlsx'),
]

for label, uid, fname in FORMS:
    print(f'=== {label} ===')
    # built xlsx
    wb = openpyxl.load_workbook(os.path.join(BASE, fname))
    ws = wb['survey']
    hdr = [c.value for c in ws[1]]
    ri = hdr.index('relevant')
    xlsx_rel = [r for r in ws.iter_rows(min_row=2, values_only=True) if r[ri]]
    print(f'  built xlsx: {len(xlsx_rel)} rows with relevant')
    for r in xlsx_rel[:3]:
        print(f'      {r[1]} -> {str(r[ri])[:80]}')

    # deployed form
    a = requests.get(f'https://kf.kobotoolbox.org/api/v2/assets/{uid}/?format=json',
                     headers=H, timeout=90).json()
    survey = a['content']['survey']
    dep_rel = [r for r in survey if r.get('relevant')]
    print(f'  deployed:   {len(dep_rel)} rows with relevant  (version {a.get("version_id")})')
    for r in dep_rel[:3]:
        print(f'      {r.get("name")} -> {str(r.get("relevant"))[:80]}')
    # sanity: does the deployed xform (xls->xform) keep the relevant? check bind
    print()
