import base64, zlib, json, os, sys, requests
import cv2
sys.stdout.reconfigure(encoding='utf-8')

PNG = os.path.join(os.path.expanduser('~'), 'Desktop', 'KoboCollect_Config_QR.png')
img = cv2.imread(PNG)
detector = cv2.QRCodeDetector()
data, pts, _ = detector.detectAndDecode(img)
if not data:
    print('QR NOT DECODABLE'); sys.exit(1)
print('QR decoded OK, payload chars:', len(data))
settings = json.loads(zlib.decompress(base64.b64decode(data)).decode('utf-8'))
g = settings.get('general', {})
print('  server_url :', g.get('server_url'))
print('  username   :', g.get('username'))
print('  password   :', '(set, hidden)' if g.get('password') else '(MISSING)')
print('  form_update_mode        :', g.get('form_update_mode'))
print('  automatic_update        :', g.get('automatic_update'))
print('  periodic_form_updates   :', g.get('periodic_form_updates_check'))
print('  project block           :', settings.get('project'))

# Verify the QR's collector account has both forms shared (owner token).
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
KF = 'https://kf.kobotoolbox.org/api/v2/assets'
user = g.get('username')
print(f'\nForm access for collector "{user}":')
for label, uid in [('HIJRA', 'aBT7aCL9p4FGcW4WwXZcr6'), ('FSW', 'aVsJ7VJ35k8GshpQpnXygC')]:
    pa = requests.get(f'{KF}/{uid}/permission-assignments/?format=json', headers=H, timeout=90).json()
    perms = [p.get('permission', '').split('/')[-2] if '/' in p.get('permission', '') else p.get('permission')
             for p in pa if isinstance(p, dict) and user in str(p.get('user', ''))]
    # cleaner: extract permission codename + user
    got = []
    for p in pa if isinstance(pa, list) else []:
        u = str(p.get('user', ''))
        if user and user in u:
            got.append(p.get('permission', '').rstrip('/').split('/')[-1])
    a = requests.get(f'{KF}/{uid}/?format=json', headers=H, timeout=90).json()
    print(f'  {label} ({uid}) active={a.get("deployment__active")}: {sorted(got) or "NO ACCESS"}')
