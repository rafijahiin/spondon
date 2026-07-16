import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
KF = 'https://kf.kobotoolbox.org/api/v2/assets'
USER = 'baseline89'
for label, uid in [('HIJRA', 'aBT7aCL9p4FGcW4WwXZcr6'), ('FSW', 'aVsJ7VJ35k8GshpQpnXygC')]:
    pa = requests.get(f'{KF}/{uid}/permission-assignments/', headers=H, timeout=90).json()
    perms = []
    for p in pa:
        u = p.get('user', '')
        if USER in u:
            perms.append(p.get('permission', '').rstrip('/').rsplit('/', 1)[-1])
    print(f'{label} {uid}: baseline89 -> {sorted(perms) or "NO ACCESS"}')
