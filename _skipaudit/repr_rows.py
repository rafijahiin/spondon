import re, sys
sys.stdout.reconfigure(encoding='utf-8')
s = open('programs/management/commands/_fsw_modules.py', encoding='utf-8').read()
for fld in ['q4_1', 'q4_8', 'q4_19']:
    i = s.find("'" + fld + "'")
    # print the 12 chars before the field name (to catch _sr open) and 340 after
    seg = s[i:i+360]
    # cut at the end of the _sr call roughly: find "')," or "')" after a reasonable point
    print('### ' + fld)
    print(repr(seg))
    print()
