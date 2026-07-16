import os, requests, sys, json
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
for label, uid in [('HIJRA', 'aBT7aCL9p4FGcW4WwXZcr6'), ('FSW', 'aVsJ7VJ35k8GshpQpnXygC')]:
    a = requests.get(f'https://kf.kobotoolbox.org/api/v2/assets/{uid}/?format=json', headers=H, timeout=90).json()
    links = a.get('deployment__links') or {}
    print(label, '->', json.dumps(links))
