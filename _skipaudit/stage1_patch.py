"""Stage 1: add the routing gates Nuruzzaman flagged (S3, S4, S5) to the Hijra
source. Quote-aware _sr(...) span matching so long-line labels with parentheses
are handled safely. Each target must currently have NO relevant."""
import sys
sys.stdout.reconfigure(encoding='utf-8')
PATH = r'C:\Users\HP\Documents\spondon_clone\programs\management\commands\_hijra_modules.py'

with open(PATH, encoding='utf-8') as f:
    src = f.read()


def sr_span(s, field):
    """Return (start,end) of the _sr(...) call whose name arg == field."""
    tok = f"'{field}',"
    n = s.count(tok)
    assert n == 1, f"{field}: expected 1 name occurrence, found {n}"
    idx = s.index(tok)
    start = s.rindex('_sr(', 0, idx)
    i = start + 3  # at '('
    depth = 0
    instr = None
    while i < len(s):
        c = s[i]
        if instr:
            if c == instr:
                instr = None
        elif c in ("'", '"'):
            instr = c
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return start, i + 1
        i += 1
    raise RuntimeError(f'{field}: unterminated _sr call')


def add_relevant(field, expr, optional=False):
    global src
    if optional and f"'{field}'," not in src:
        print(f'  (skip) {field}: not present')
        return
    a, b = sr_span(src, field)
    call = src[a:b]
    assert 'relevant=' not in call, f'{field}: already has a relevant — aborting'
    new = call[:-1] + f', relevant="{expr}")'
    src = src[:a] + new + src[b:]
    print(f'  patched {field}: relevant="{expr}"')


# S3 (a213_nid_match) is patched directly in build_baseline_forms.py.

# S4 — HIV-testing follow-ups only if ever tested (q5_8 = Yes); else skip to q5_12
for fld in ('q5_9_count', 'q5_9', 'q5_10', 'q5_11'):
    add_relevant(fld, "${q5_8}='1'")

# S5 — reproductive-coercion 7.2 & partner-directed 7.3 hidden for Intersex (7)
A102 = "${a102_respondent_type}!='7'"
for grp in ('q7_2', 'q7_3'):
    add_relevant(f'{grp}_intro', A102, optional=True)
    for sub in 'abcde':
        add_relevant(f'{grp}_{sub}_ever', A102)

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print('\nStage 1 written.')
