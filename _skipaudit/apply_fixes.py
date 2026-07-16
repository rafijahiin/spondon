"""Apply the 4 confirmed skip-logic fixes to the source generator, with
assertions that each targets exactly one line."""
import sys
sys.stdout.reconfigure(encoding='utf-8')
CMD = r'C:\Users\HP\Documents\spondon_clone\programs\management\commands'
HIJRA = CMD + r'\_hijra_modules.py'
FSW = CMD + r'\_fsw_modules.py'

# q7_14 gate: fire when ANY past-12-month violence item = Yes ('1').
q7 = ' or '.join(f"${{q7_1_{c}_12mo}}='1'" for c in 'abcdefghijk')
q7 += ' or ' + ' or '.join(f"${{q7_2_{c}_12mo}}='1'" for c in 'abcde')


def patch(path, edits):
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()
    for marker, fn in edits:
        idxs = [i for i, l in enumerate(lines) if marker in l]
        assert len(idxs) == 1, f'{marker!r}: expected exactly 1 line, found {len(idxs)}'
        i = idxs[0]
        new = fn(lines[i])
        assert new != lines[i], f'{marker!r}: patch produced no change'
        lines[i] = new
        print(f'  patched {marker}')
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)


def fix_q4_14(line):
    return line.replace(
        'relevant="${q4_1}!=\'2\' and ${q4_1}!=\'99\'"',
        'relevant="${q4_1}!=\'2\' and ${q4_1}!=\'99\' and ${q4_13}=\'1\'"')


def add_q7_14(line):
    s = line.rstrip('\n')
    assert s.endswith("),"), repr(s[-12:])
    head = s[:-2]  # drop the closing ')' and the list-separator ','
    return head + f', relevant="{q7}"),\n'


def fix_q3_11(line):
    return line.replace(", relevant=\"${q3_8}='1'\"", "")


def fix_q5_11(line):
    return line.replace(", relevant=\"${q5_9}='1'\"", "")


print('HIJRA:')
patch(HIJRA, [("'q4_14',", fix_q4_14), ("'q7_14',", add_q7_14)])
print('FSW:')
patch(FSW, [("'q3_11',", fix_q3_11), ("'q5_11',", fix_q5_11)])
print('\nq7_14 new relevant =', q7)
