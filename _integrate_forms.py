import json, html, sys, shutil
sys.stdout.reconfigure(encoding='utf-8')

OUT = r'C:\Users\HP\AppData\Local\Temp\claude\C--Users-HP--claude\f165f7b0-8e97-4ced-aa62-062ce5b41135\tasks\w05x959k8.output'
GEN = r'C:\Users\HP\Documents\spondon_clone\programs\management\commands\build_ciprb_forms.py'

data = json.load(open(OUT, encoding='utf-8'))['result']

funcs = {}  # fn_name -> unescaped code
for form in data:
    fin = form['final']
    for which in ('survey', 'choices'):
        name = form[f'{which}_fn']
        code = html.unescape(fin[f'{which}_code'])
        funcs[name] = code
    print(f"=== {form['key']}  {form['name']}")
    print(f"    survey_fn={form['survey_fn']}  choices_fn={form['choices_fn']}")
    print(f"    changed={len(fin.get('changed', []))}  uncertain={len(fin.get('uncertain', []))}")
    for u in fin.get('uncertain', [])[:15]:
        print(f"      ? {u[:170]}")
    print(f"    NOTES: {(fin.get('notes') or '')[:400]}")
    print()

src = open(GEN, encoding='utf-8').read()
lines = src.split('\n')

def find_span(lines, name):
    start = next((i for i, ln in enumerate(lines) if ln.startswith(f'def {name}(')), None)
    if start is None:
        return None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        ln = lines[j]
        if (ln.startswith('def ') or ln.startswith('class ')
                or ln.startswith('FORMS ') or ln.startswith('# ╔')):
            end = j
            break
    return (start, end)

spans = []
for name, code in funcs.items():
    sp = find_span(lines, name)
    if sp is None:
        print('!! NOT FOUND:', name); sys.exit(1)
    spans.append((sp[0], sp[1], name, code))
    print(f'  found {name}: old lines {sp[0]}..{sp[1]-1}  boundary next = {lines[sp[1]][:50]!r}')

shutil.copyfile(GEN, GEN + '.bak')
print('\nbackup ->', GEN + '.bak')

for start, end, name, code in sorted(spans, key=lambda x: x[0], reverse=True):
    code_lines = code.rstrip('\n').split('\n')
    lines[start:end] = code_lines + ['', '']
    print(f'  replaced {name}  ({len(code_lines)} lines)')

open(GEN, 'w', encoding='utf-8').write('\n'.join(lines))
print('\nWROTE', GEN)
