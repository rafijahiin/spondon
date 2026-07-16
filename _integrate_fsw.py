# -*- coding: utf-8 -*-
"""Integrate the FSW transcription workflow output into _fsw_modules.py and
print the adversarial-verify reports. Mirrors _integrate_hijra.py."""
import json, io, sys, re
sys.stdout.reconfigure(encoding='utf-8')

OUT = (r'C:\Users\HP\AppData\Local\Temp\claude\C--Users-HP--claude'
       r'\22695810-ec6c-4a5d-aa41-2723a35da306\tasks\w94q0sllq.output')
GEN = (r'C:\Users\HP\Documents\spondon_clone\programs\management\commands'
       r'\_fsw_modules.py')

_BS, _Q = chr(92), chr(39)


def _fix(s):
    # Escape English content apostrophes (respondent's) the agent left unescaped
    # inside single-quoted Python literals; a letter-'-letter is never a delimiter.
    s = re.sub(r"(\w)'(\w)", lambda m: m.group(1) + _BS + _Q + m.group(2), s)
    # Collapse the agent's over-escaped \\' to \'.
    s = s.replace(_BS + _BS + _Q, _BS + _Q)
    # Un-escape XML/HTML entities the agent emitted inside relevant expressions
    # (e.g. ${a213}&gt;0 -> ${a213}>0). Order: lt/gt before amp.
    s = s.replace('&gt;', '>').replace('&lt;', '<').replace('&amp;', '&')
    return s


raw = open(OUT, encoding='utf-8').read()
data = json.loads(raw)
if isinstance(data, dict) and 'result' in data:
    data = data['result']
by_id = {d['id']: d for d in data if isinstance(d, dict) and d.get('id')}
order = ['fsw_m1a', 'fsw_m1b', 'fsw_m2', 'fsw_m3', 'fsw_m4',
         'fsw_m5', 'fsw_m6', 'fsw_m7', 'fsw_m8', 'fsw_m9']

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
g.write('"""AUTO-GENERATED (workflow w94q0sllq) — FSW baseline Modules 1-9, '
        'verbatim EN/BN. Regenerate via _integrate_fsw.py or fix in place."""\n\n')
g.write("def _sr(qtype, name, en='', bn='', hint='', required='', relevant='', "
        "constraint='', cmsg='', default='', app='', calc=''):\n")
g.write('    return [qtype, name, en, bn, hint, required, relevant, '
        'constraint, cmsg, default, app, calc]\n\n')
g.write("def _ch(lst, name, en, bn=''):\n    return [lst, name, en, bn]\n\n")
g.write('def fsw_module_survey():\n    return [\n')
g.write(',\n'.join(surveys))
g.write('\n    ]\n\n')
g.write('def fsw_module_choices():\n    return [\n')
g.write(',\n'.join(choices))
g.write('\n    ]\n')
open(GEN, 'w', encoding='utf-8').write(g.getvalue())
print('\nWROTE', GEN)
