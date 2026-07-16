"""Gate-coverage: which fields drive the most skips, and do the big gates
(consent / eligibility) actually cover the downstream body?"""
import os, re, sys, openpyxl
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'koboforms_baseline')
FILES = [('HIJRA', 'CIPRB_Baseline_Hijra.xlsx'), ('FSW', 'CIPRB_Baseline_FSW.xlsx')]
REF = re.compile(r"\$\{(\w+)\}")

for label, fname in FILES:
    wb = openpyxl.load_workbook(os.path.join(BASE, fname))
    sv = wb['survey']
    svh = [c.value for c in sv[1]]
    ti, ni, ri, li = svh.index('type'), svh.index('name'), svh.index('relevant'), svh.index('label::English')
    rows = [r for r in sv.iter_rows(min_row=2, values_only=True)]

    driver = Counter()
    total_rel = 0
    for r in rows:
        if r[ri]:
            total_rel += 1
            for fld in set(REF.findall(r[ri])):
                driver[fld] += 1

    print(f'=== {label}: {total_rel} relevant rows ===')
    print('  top skip-driver fields (how many downstream rows each gates):')
    for fld, n in driver.most_common(12):
        # show the field's label/type for context
        lbl = ''
        for r in rows:
            if r[ni] == fld:
                lbl = (r[li] or '')[:45]; break
        print(f'     {fld:16s} gates {n:3d} rows   "{lbl}"')
    print()
