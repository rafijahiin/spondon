import django, os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'spondon.settings')
django.setup()
from programs.management.commands.build_baseline_forms import _fsw_survey, _add_other_specify, _fsw_choices
sv = _fsw_survey()
sv = _add_other_specify(sv, _fsw_choices())   # mirror the build pipeline
by = {r[1]: r for r in sv if r[1]}
def show(f, attr, idx):
    r = by.get(f)
    print(f'  {f:16s} {attr}= {r[idx]!r}' if r else f'  {f}: ABSENT')
print('LOGIC FIXES:')
show('q4_1', 'calc', 11)
show('q4_8', 'relevant', 6)
show('q4_19', 'relevant', 6)
print('\nOTHER-SPECIFY BOXES present:')
for f in ['b202_other','b203_other','b204_other','q7_19_other','q7_20_other','q7_21_other','q7_23_other']:
    print(f'  {f:16s}', 'YES' if f in by else 'MISSING', '| gate:', by[f][6] if f in by else '-')
print('\nComposite categories NOT given a box (correct):')
for f in ['a207_other']:
    print(f'  {f:16s}', 'present(!)' if f in by else 'absent (correct)')
