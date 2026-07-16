"""Build baseline/form_schema.json (labels + choices + section) from the live dump.
Read by baseline/schema.py at runtime to render coded answers as real text."""
import json, os, re

HERE = os.path.dirname(__file__)
src = json.load(open(os.path.join(HERE, '_baseline_schema.json'), encoding='utf-8'))
OUT = os.path.join(HERE, 'baseline', 'form_schema.json')


def section_of(name: str) -> str:
    n = name.lower()
    if n in ('district', 'site_code') or n.startswith(('interview_', 'consent', 's1', 's2', 's3', 's4')):
        return 'Screening & identification'
    m = re.match(r'([a-z])', n)
    letter = m.group(1) if m else ''
    return {
        'a': 'A · Respondent profile',
        'b': 'B · Livelihood & household',
        'c': 'C · Sexual & reproductive health',
        'd': 'D · Health services & access',
        'e': 'E · Rights, violence & wellbeing',
        'f': 'F · Knowledge & awareness',
        'g': 'G · Additional',
    }.get(letter, 'Other')


def clip(s, n):
    s = (s or '').strip()
    return s[:n]


out = {}
for pop in ('hijra', 'fsw'):
    fields = src[pop]['fields']
    clists = src[pop]['choices']
    labels, choices, sections, types, order = {}, {}, {}, {}, []
    for fld in fields:
        nm = fld['name']
        order.append(nm)
        labels[nm] = clip(fld['label'], 180)
        # Real questionnaire module/section from the XLSForm group structure;
        # fall back to the letter heuristic only if a field has no group.
        sections[nm] = clip(fld.get('section'), 80) or section_of(nm)
        types[nm] = fld['type']
        lst = fld.get('list')
        if lst and lst in clists:
            cmap = {}
            for c in clists[lst]:
                cmap[str(c['name'])] = clip(c['label'], 90)
            if cmap:
                choices[nm] = cmap
    out[pop] = {'uid': src[pop]['uid'], 'name': src[pop]['name'],
                'labels': labels, 'choices': choices, 'sections': sections,
                'types': types, 'order': order}
    print(f'{pop}: {len(labels)} labels, {len(choices)} coded fields')

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
size = os.path.getsize(OUT)
print(f'WROTE {OUT} ({size/1024:.0f} KB)')
