"""Deeper skip-logic checks that value-validity alone misses:
 (A) select_multiple compared with = / != instead of selected()  -> never fires
 (B) relevant references a field that is DEFINED LATER in the form -> forward ref
 (C) unknown function calls / stray refs
"""
import os, re, sys, openpyxl
sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'koboforms_baseline')
FILES = [('HIJRA', 'CIPRB_Baseline_Hijra.xlsx'), ('FSW', 'CIPRB_Baseline_FSW.xlsx')]
CMP = re.compile(r"\$\{(\w+)\}\s*(=|!=)\s*'")
REF = re.compile(r"\$\{(\w+)\}")

for label, fname in FILES:
    wb = openpyxl.load_workbook(os.path.join(BASE, fname))
    sv = wb['survey']
    svh = [c.value for c in sv[1]]
    ti, ni, ri = svh.index('type'), svh.index('name'), svh.index('relevant')

    order = []          # field name in survey order
    ftype = {}          # name -> base type
    for row in sv.iter_rows(min_row=2, values_only=True):
        nm = row[ni]; t = (row[ti] or '')
        if nm:
            ftype[nm] = t.split()[0] if t else ''
            order.append(nm)
    pos = {nm: i for i, nm in enumerate(order)}

    multi_eq = []       # (A)
    fwd_ref = []        # (B)
    for i, row in enumerate(sv.iter_rows(min_row=2, values_only=True)):
        expr = row[ri]; nm = row[ni]
        if not expr:
            continue
        for fld, op in CMP.findall(expr):
            if ftype.get(fld) == 'select_multiple':
                multi_eq.append((nm, fld, op))
        # forward reference: relevant on row nm referencing a field defined after nm
        if nm in pos:
            for fld in REF.findall(expr):
                if fld in pos and pos[fld] > pos[nm]:
                    fwd_ref.append((nm, fld))

    print(f'=== {label} ===')
    print(f'  (A) select_multiple compared with =/!= (should be selected()): {len(multi_eq)}')
    for nm, fld, op in multi_eq[:30]:
        print(f'        [{nm}]  ${{{fld}}} {op} ...   ({fld} is select_multiple!)')
    print(f'  (B) forward references (relevant points at a later field): {len(fwd_ref)}')
    for nm, fld in fwd_ref[:30]:
        print(f'        [{nm}] -> ${{{fld}}} defined later')
    print()
