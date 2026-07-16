"""Stage 2 module edits on _fsw_modules.py:
  - remove the dc_name signature footer (Nuruzzaman: delete from KOBO)
  - collapse B106 (years + months) to a single months field with conversion hint
Quote-aware _sr(...) span matching."""
import sys
sys.stdout.reconfigure(encoding='utf-8')
PATH = r'C:\Users\HP\Documents\spondon_clone\programs\management\commands\_fsw_modules.py'
with open(PATH, encoding='utf-8') as f:
    src = f.read()


def sr_span(s, field):
    tok = f"'{field}',"
    n = s.count(tok)
    assert n == 1, f'{field}: expected 1, found {n}'
    idx = s.index(tok)
    start = s.rindex('_sr(', 0, idx)
    i = start + 3
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
    raise RuntimeError(field)


def remove_sr(field):
    global src
    a, b = sr_span(src, field)
    j = b
    while j < len(src) and src[j] in ' ,\n\t':
        j += 1
    src = src[:a] + src[j:]
    print(f'  removed {field}')


def replace_sr(field, newcall):
    global src
    a, b = sr_span(src, field)
    src = src[:a] + newcall + src[b:]
    print(f'  replaced {field}')


assert '${b106_years}' not in src.replace("'b106_years'", ''), 'b106_years is referenced elsewhere — do not remove'
assert '${dc_name}' not in src, 'dc_name is referenced elsewhere — do not remove'

remove_sr('dc_name')
remove_sr('b106_years')
replace_sr('b106_months',
           "_sr('integer','b106_months',"
           "'Duration in this area — total months',"
           "'এই এলাকায় থাকার সময়কাল — মোট মাস',"
           " hint='Record in completed months. If the respondent answers in years, "
           "convert to months (years x 12) and enter the total.',"
           " constraint='. >= 0 and . <= 1200')")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print('Stage 2 module patch written.')
