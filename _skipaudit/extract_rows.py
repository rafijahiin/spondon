import re, sys
sys.stdout.reconfigure(encoding='utf-8')
f = 'programs/management/commands/_fsw_modules.py'
s = open(f, encoding='utf-8').read()

def extract(field):
    m = re.search(r",'" + re.escape(field) + r"',", s)
    if not m:
        return f"{field}: NOT FOUND"
    start = s.rfind('_sr(', 0, m.start())
    i = start + 4
    depth = 1
    q = None
    while i < len(s) and depth > 0:
        c = s[i]
        if q:
            if c == '\\':
                i += 2
                continue
            if c == q:
                q = None
        else:
            if c in "'\"":
                q = c
            elif c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
        i += 1
    return s[start:i]

for fld in ['b202', 'b203', 'b204', 'q4_1', 'q4_8', 'q4_19', 'q7_19', 'q7_20', 'q7_21']:
    print('### ' + fld)
    print(extract(fld))
    print()
