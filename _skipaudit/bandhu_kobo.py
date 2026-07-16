import os, requests, sys
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
KF = 'https://kf.kobotoolbox.org/api/v2/assets'

# List ALL assets visible to this token, with deployment + submission counts.
r = requests.get(f'{KF}/?format=json&limit=200', headers=H, timeout=90).json()
results = r.get('results', [])
print(f'total assets visible: {r.get("count")}')
print(f'{"UID":24} {"subs":>6}  {"deployed":8}  name')
print('-' * 90)
for a in sorted(results, key=lambda x: -(x.get('deployment__submission_count') or 0)):
    name = a.get('name', '')
    uid = a.get('uid', '')
    subs = a.get('deployment__submission_count') or 0
    dep = a.get('has_deployment')
    # highlight bandhu-related
    tag = ' <== BANDHU' if 'bandhu' in name.lower() else ''
    print(f'{uid:24} {subs:6}  {str(dep):8}  {name}{tag}')
