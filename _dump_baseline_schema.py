"""Dump both baseline forms' survey + choices to JSON so we can build:
  1. a code->label + value->label map (readable approval detail)
  2. a realistic demo-data generator keyed to real field codes
  3. an insights aggregation keyed to real field codes
"""
import os, sys, json, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
OUT = os.path.join(os.path.dirname(__file__), '_baseline_schema.json')

FORMS = {'hijra': 'aBT7aCL9p4FGcW4WwXZcr6', 'fsw': 'aVsJ7VJ35k8GshpQpnXygC'}
result = {}
for pop, uid in FORMS.items():
    a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=90).json()
    content = a.get('content', {})
    survey = content.get('survey', [])
    choices = content.get('choices', [])

    def lab(x):
        L = x.get('label')
        if isinstance(L, list):
            return L[0] if L else ''
        return L or ''

    # choice lists: list_name -> [{name, label}]
    clists = {}
    for c in choices:
        ln = c.get('list_name', '')
        clists.setdefault(ln, []).append({'name': str(c.get('name', '')), 'label': lab(c)})

    fields = []
    group_stack = []  # (name, label) for each open begin_group
    for r in survey:
        t = r.get('type', '')
        if t in ('begin_group', 'begin group', 'begin_repeat', 'begin repeat'):
            group_stack.append((r.get('name', ''), lab(r)))
            continue
        if t in ('end_group', 'end group', 'end_repeat', 'end repeat'):
            if group_stack:
                group_stack.pop()
            continue
        if t in ('start', 'end', 'today', 'deviceid', 'note', 'calculate'):
            continue
        nm = r.get('name', '')
        if not nm:
            continue
        select_list = r.get('select_from_list_name', '')
        if not select_list and (t.startswith('select_one') or t.startswith('select_multiple')):
            parts = t.split()
            select_list = parts[1] if len(parts) > 1 else ''
        # section = label of the OUTERMOST enclosing group (the questionnaire
        # module), so every q… field lands under its real section, not "Other".
        section = ''
        for _, glab in group_stack:
            if glab:
                section = glab
                break
        fields.append({
            'name': nm, 'type': t, 'label': lab(r),
            'list': select_list, 'required': bool(r.get('required')),
            'section': section,
            'group_path': [gl for _, gl in group_stack if gl],
        })
    result[pop] = {'uid': uid, 'name': a.get('name'), 'fields': fields, 'choices': clists}
    print(f'{pop}: {len(fields)} fields, {len(clists)} choice lists')

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=1)
print('WROTE', OUT)
