import sys, openpyxl
sys.stdout.reconfigure(encoding='utf-8')
wb = openpyxl.load_workbook(r'_ciprb_build/CIPRB-10_MPDSR_Response_Plan.xlsx')
ws = wb['survey']
rows = list(ws.iter_rows(values_only=True))
header = list(rows[0])
ni = header.index('name')
ci = header.index('calculation') if 'calculation' in header else None
coni = header.index('constraint') if 'constraint' in header else None


def cell(rowname, idx):
    for r in rows[1:]:
        if len(r) > ni and r[ni] == rowname:
            return r[idx] if (idx is not None and len(r) > idx) else None
    return None


calc = cell('_act_dist_code', ci) or ''
cons = cell('action_id', coni) or ''
print('_act_dist_code calc (head):', calc[:90])
print('action_id constraint     :', cons[:120])
checks = {
    "calc uses numeric codes (dhaka→10)": "'dhaka','10'" in calc,
    "calc uses numeric codes (bhola→2)": "'bhola','2'" in calc,
    "no letter codes (no 'KU')": "'KU'" not in calc and "'BH'" not in calc,
    "constraint is 3-digit ([0-9]{3})": "[0-9]{3}" in cons,
    "constraint NOT 2+ digit": "[0-9]{2,}" not in cons,
}
for k, v in checks.items():
    print(f'  {"OK " if v else "XX "}{k}')
ok = all(checks.values())
print('\nNUMERIC + 3-DIGIT OK:', ok)
sys.exit(0 if ok else 2)
