# -*- coding: utf-8 -*-
"""Integrate the Hijra transcription workflow output into a generated module file,
and print the adversarial-verify reports so fidelity issues surface immediately."""
import json, io, sys, re
sys.stdout.reconfigure(encoding='utf-8')

OUT = (r'C:\Users\HP\AppData\Local\Temp\claude\C--Users-HP--claude'
       r'\22695810-ec6c-4a5d-aa41-2723a35da306\tasks\worapld2c.output')
GEN = (r'C:\Users\HP\Documents\spondon_clone\programs\management\commands'
       r'\_hijra_modules.py')

_BS, _Q = chr(92), chr(39)


def _fix(s):
    # Escape English content apostrophes (respondent's, don't) the agent left
    # unescaped inside single-quoted Python literals. A letter-'-letter is never
    # a string delimiter in the _sr(...) structure, so this is safe. Bengali
    # uses curly quotes (U+2018/9), not ASCII ', so it is untouched.
    s = re.sub(r"(\w)'(\w)", lambda m: m.group(1) + _BS + _Q + m.group(2), s)
    # Collapse the agent's over-escaped \\' (backslash-backslash-quote) to \'.
    s = s.replace(_BS + _BS + _Q, _BS + _Q)
    # Restore the English en-/em-dashes the FIES module normalised to hyphens
    # (verbatim deviations the adversarial verify flagged on m1c).
    s = s.replace('(1-2 times)', '(1–2 times)')
    s = s.replace('(3-10 times)', '(3–10 times)')
    s = s.replace('C101-C109', 'C101–C109')
    s = s.replace('(FIES) - Past 12 Months. [Read', '(FIES) — Past 12 Months [Read')
    # NOTE: the m4 skip fix (gate Q4.4-Q4.11 on ${q4_3}!='2') is applied
    # STRUCTURALLY by question name in build_baseline_forms._hijra_survey(), not
    # here — a string-replace hit every question sharing the base relevant and
    # made q4_3 reference itself (an ODK relevant-logic cycle).
    return s


raw = open(OUT, encoding='utf-8').read()
data = json.loads(raw)
if isinstance(data, dict) and 'result' in data:
    data = data['result']
by_id = {d['id']: d for d in data if isinstance(d, dict) and d.get('id')}
order = ['hijra_m1c', 'hijra_m2', 'hijra_m3', 'hijra_m4', 'hijra_m5',
         'hijra_m6', 'hijra_m7', 'hijra_m8', 'hijra_m9']

print('=== ADVERSARIAL VERIFY REPORTS ===')
surveys, choices = [], []
for mid in order:
    d = by_id.get(mid)
    if not d:
        print(f'{mid}: *** MISSING FROM OUTPUT ***')
        continue
    v = d.get('verify') or {}
    iss = v.get('issues') or []
    miss = v.get('missing_qids') or []
    print(f'\n{mid}: q={d.get("question_count")} ok={v.get("ok")} '
          f'verbatim={v.get("verbatim_ok")} choice_integ={v.get("choice_integrity_ok")} '
          f'#issues={len(iss)} missing={miss}')
    for s in iss[:10]:
        print('    -', s)
    surveys.append(_fix((d.get('survey_python') or '').strip().rstrip(',')))
    choices.append(_fix((d.get('choices_python') or '').strip().rstrip(',')))

g = io.StringIO()
g.write('# -*- coding: utf-8 -*-\n')
g.write('"""AUTO-GENERATED (workflow worapld2c) — Hijra baseline Modules 1c-9, '
        'verbatim EN/BN. Regenerate via _integrate_hijra.py or fix in place."""\n\n')
g.write("def _sr(qtype, name, en='', bn='', hint='', required='', relevant='', "
        "constraint='', cmsg='', default='', app='', calc=''):\n")
g.write('    return [qtype, name, en, bn, hint, required, relevant, '
        'constraint, cmsg, default, app, calc]\n\n')
g.write("def _ch(lst, name, en, bn=''):\n    return [lst, name, en, bn]\n\n")
g.write('def hijra_module_survey():\n    return [\n')
g.write(',\n'.join(surveys))
g.write('\n    ]\n\n')
g.write('def hijra_module_choices():\n    return [\n')
g.write(',\n'.join(choices))
g.write('\n    ]\n')
open(GEN, 'w', encoding='utf-8').write(g.getvalue())
print('\nWROTE', GEN)
