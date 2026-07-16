"""Audit skip logic: for every relevant expression, extract ${field}='value'
comparisons and verify the value is a real choice code for that field. A value
that isn't in the field's choice list = a skip that can never fire (broken)."""
import os, re, sys, openpyxl
sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'koboforms_baseline')
FILES = [('HIJRA', 'CIPRB_Baseline_Hijra.xlsx'), ('FSW', 'CIPRB_Baseline_FSW.xlsx')]

CMP = re.compile(r"\$\{(\w+)\}\s*(=|!=)\s*'([^']*)'")

for label, fname in FILES:
    wb = openpyxl.load_workbook(os.path.join(BASE, fname))
    sv = wb['survey']; ch = wb['choices']
    svh = [c.value for c in sv[1]]
    ti, ni, ri = svh.index('type'), svh.index('name'), svh.index('relevant')

    # list_name -> set(codes)
    chh = [c.value for c in ch[1]]
    li, ci = chh.index('list_name'), chh.index('name')
    codes = {}
    for row in ch.iter_rows(min_row=2, values_only=True):
        if row[li]:
            codes.setdefault(row[li], set()).add(str(row[ci]))

    # field name -> list_name (for select fields)
    field_list = {}
    field_type = {}
    for row in sv.iter_rows(min_row=2, values_only=True):
        t = (row[ti] or '')
        nm = row[ni]
        if not nm:
            continue
        field_type[nm] = t.split()[0] if t else ''
        if t.startswith('select_one') or t.startswith('select_multiple'):
            parts = t.split()
            if len(parts) > 1:
                field_list[nm] = parts[1]

    broken = []
    rel_rows = 0
    for row in sv.iter_rows(min_row=2, values_only=True):
        expr = row[ri]
        if not expr:
            continue
        rel_rows += 1
        for fld, op, val in CMP.findall(expr):
            lst = field_list.get(fld)
            if lst is None:
                # field is not a select (integer/text/calc) — value compare is fine
                if fld not in field_type:
                    broken.append((row[ni], fld, val, 'REF field not found'))
                continue
            if val not in codes.get(lst, set()):
                broken.append((row[ni], fld, val,
                               f"value '{val}' not in {lst} codes {sorted(codes.get(lst, set()))[:8]}"))

    print(f'=== {label}: {rel_rows} relevant rows audited ===')
    if not broken:
        print('   OK — every ${field}=value comparison uses a valid choice code.\n')
    else:
        print(f'   {len(broken)} suspicious comparison(s):')
        for on, fld, val, why in broken[:40]:
            print(f'     [{on}]  ${{{fld}}}=\'{val}\'  -> {why}')
        print()
