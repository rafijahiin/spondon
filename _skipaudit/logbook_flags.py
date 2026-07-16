import os, requests, sys
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
r = requests.get('https://kf.kobotoolbox.org/api/v2/assets/a7PgkrZcH8gMxqsdgkf6fF/data/?format=json&limit=30000',
                 headers=H, timeout=120).json()
res = [s for s in r.get('results', []) if str(s.get('record_type') or '') == 'wellness_logbook']
print('wellness_logbook subs:', len(res))

def short(k):
    return k.split('/')[-1]

def g(s, name):
    for k, v in s.items():
        if short(k) == name:
            return v
    return None

for f in ['log_htc', 'log_gbv', 'log_mental_health', 'log_counseling', 'log_clinical', 'log_sti_screening']:
    c = Counter(str(g(s, f)).lower() for s in res)
    print(f'  {f}: {dict(c)}')
iec = sum(int(g(s, 'log_iec') or 0) for s in res if str(g(s, 'log_iec') or '').lstrip('-').isdigit())
print('  sum log_iec:', iec)
