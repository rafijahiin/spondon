import os, requests, json, sys
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
print('tok present:', bool(tok))
r = requests.get(
    'https://kf.kobotoolbox.org/api/v2/assets/aBT7aCL9p4FGcW4WwXZcr6/submissions/?format=json&limit=1',
    headers={'Authorization': f'Token {tok}'}, timeout=60
)
print('HTTP:', r.status_code)
d = r.json()
print('Total subs:', d.get('count'))
if d.get('results'):
    s = d['results'][0]
    print('Sub _id:', s.get('_id'))
    key_fields = ['questionnaire_serial', 'cluster_site_code', 'district', 'interview_date',
                  's2_age', 'a205_age', 'a201_district', 'a202_upazila', 'consent',
                  'interview_language', 'interview_method']
    for kf in key_fields:
        match = next((k for k in s if k.endswith('/' + kf) or k == kf), None)
        print(f'  {kf}: {s.get(match, "---")} (key={match})')
    print('Total keys in sub:', len(s))
    print('First 15 keys:', list(s.keys())[:15])
