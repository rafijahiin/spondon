"""Verify the NK-feedback fixes in the GENERATED survey (not the live form yet).
Walks the exact rows _hijra_survey()/_fsw_survey() produce and asserts structure."""
import django, os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'spondon.settings')
django.setup()
from programs.management.commands.build_baseline_forms import _hijra_survey, _fsw_survey

def idx(rows):
    return {r[1]: (i, r) for i, r in enumerate(rows) if r[1]}

def check(form, rows, perp_other_code, sections):
    names = [r[1] for r in rows if r[1]]
    by = idx(rows)
    fails = []
    def ok(cond, msg):
        (print(f'  OK  {msg}') if cond else fails.append(msg))

    # ---- timing (i/iii) ----
    ok('interview_start_note' in by, 'start-time note present')
    ok('interview_start_disp' in by, 'start-time display calc present')
    ok('interview_end_note' in by, 'end-time note present')
    # end note must be at the very end
    ok(names[-1] == 'interview_end_note', f'end note is LAST row (is: {names[-1]})')
    sn = by['interview_start_note'][1]
    ok('${interview_start_disp}' in sn[2], 'start note shows the captured value')

    # ---- perp restructure (vi/vii) ----
    for sec, letters in sections.items():
        for L in letters:
            p = f'{sec}_{L}'
            need = [f'{p}_ever', f'{p}_perp', f'{p}_perp_other', f'{p}_12mo',
                    f'{p}_perp_12mo', f'{p}_perp_12mo_other']
            if f'{p}_ever' not in by or f'{p}_perp' not in by:
                continue
            positions = [by[n][0] for n in need if n in by]
            ok(all(n in by for n in need), f'{p}: all 6 rows present')
            ok(positions == sorted(positions),
               f'{p}: order ever<perp<perp_other<12mo<perp_12mo<perp_12mo_other')
            # relevants
            ok(by[f'{p}_perp'][1][6] == f"${{{p}_ever}}='1'", f'{p}_perp gated on ever')
            ok(by[f'{p}_perp_12mo'][1][6] == f"${{{p}_12mo}}='1'", f'{p}_perp_12mo gated on 12mo')
            exp = f"selected(${{{p}_perp_12mo}},'{perp_other_code}')"
            ok(by[f'{p}_perp_12mo_other'][1][6] == exp,
               f"{p}_perp_12mo_other uses code {perp_other_code}")
    # no perp_other should remain BUNCHED after the battery (each must sit right
    # after its perp). Spot check: perp_other index == perp index + 1
    for sec, letters in sections.items():
        for L in letters:
            p = f'{sec}_{L}'
            if f'{p}_perp' in by and f'{p}_perp_other' in by:
                ok(by[f'{p}_perp_other'][0] == by[f'{p}_perp'][0] + 1,
                   f'{p}_perp_other is directly under its perp')

    print(f'\n{form}: {"ALL PASS" if not fails else "FAILURES:"}')
    for f in fails:
        print('  FAIL', f)
    return not fails

hij = _hijra_survey()
fsw = _fsw_survey()

# Hijra: Other=13; sections Q7.1 a-k, Q7.2 a-e, Q7.11 a-h
h_ok = check('HIJRA', hij, '13', {
    'q7_1': list('abcdefghijk'), 'q7_2': list('abcde'), 'q7_11': list('abcdefgh')})
# extra Hijra checks
hby = idx(hij)
print('  --- Hijra point checks ---')
print('  q2_13_other present:', 'q2_13_other' in hby)
print('  q9_9_other present:', 'q9_9_other' in hby)
print('  module9_verified_date REMOVED:', 'module9_verified_date' not in hby)
print('  module9_entry_date REMOVED:', 'module9_entry_date' not in hby)
print('  module9_collected_date KEPT:', 'module9_collected_date' in hby)
print('  a213_nid_match relevant:', hby.get('a213_nid_match', (0,[None]*7))[1][6])

# FSW: Other=12; sections Q7.1 i-xii, Q7.2 a-e, Q7.14 a-i
f_ok = check('FSW', fsw, '12', {
    'q7_1': ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii'],
    'q7_2': list('abcde'), 'q7_14': list('abcdefghi')})
fby = idx(fsw)
print('  --- FSW point checks ---')
print('  q9_10_other present:', 'q9_10_other' in fby)
print('  q2_13_other present (already had):', 'q2_13_other' in fby)
print('  sup_date REMOVED:', 'sup_date' not in fby)
print('  de_date REMOVED:', 'de_date' not in fby)
print('  dc_date KEPT:', 'dc_date' in fby)

print('\n==== RESULT:', 'ALL GREEN' if (h_ok and f_ok) else 'CHECK FAILURES ABOVE')
