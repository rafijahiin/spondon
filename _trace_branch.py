"""Trace a real skip branch end-to-end: show the trigger question, its choice
codes, and the following rows with group-nesting + appearance + relevant, so we
can see whether a 'No' answer actually routes to the right follow-up."""
import os, sys, openpyxl
sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'koboforms_baseline')

FORM = sys.argv[1] if len(sys.argv) > 1 else 'CIPRB_Baseline_Hijra.xlsx'
TRIGGER = sys.argv[2] if len(sys.argv) > 2 else 'q4_1'
SPAN = int(sys.argv[3]) if len(sys.argv) > 3 else 22

wb = openpyxl.load_workbook(os.path.join(BASE, FORM))
sv = wb['survey']; ch = wb['choices']
h = [c.value for c in sv[1]]
ti, ni, li, ai, ri = (h.index('type'), h.index('name'), h.index('label::English'),
                      h.index('appearance'), h.index('relevant'))
rows = [r for r in sv.iter_rows(min_row=2, values_only=True)]

# choices map
chh = [c.value for c in ch[1]]
cl, cn, clab = chh.index('list_name'), chh.index('name'), chh.index('label::English')
choices = {}
for r in ch.iter_rows(min_row=2, values_only=True):
    if r[cl]:
        choices.setdefault(r[cl], []).append((r[cn], r[clab]))

# find trigger, print its choices
idx = next(i for i, r in enumerate(rows) if r[ni] == TRIGGER)
tt = rows[idx][ti]
print(f'TRIGGER  {TRIGGER}  ({tt})  "{rows[idx][li]}"')
if tt and tt.split()[0] in ('select_one', 'select_multiple'):
    lst = tt.split()[1]
    print('   choices:', ', '.join(f'{c}={lab}' for c, lab in choices.get(lst, [])))
print(f'   relevant: {rows[idx][ri]}')
print('\n--- following rows (indent = group depth) ---')
depth = 0
for r in rows[idx:idx + SPAN]:
    t = (r[ti] or '')
    base = t.split()[0] if t else ''
    if base == 'end_group':
        depth -= 1
    pad = '  ' * max(depth, 0)
    nm = r[ni] or ''
    app = f" app={r[ai]}" if r[ai] else ''
    rel = f"  REL[{r[ri]}]" if r[ri] else ''
    lab = (r[li] or '')[:42]
    print(f'{pad}{base:13s} {nm:16s}{app}{rel}  {lab}')
    if base.startswith('begin_group') or base == 'begin_group':
        depth += 1
