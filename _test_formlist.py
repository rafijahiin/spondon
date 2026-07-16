"""Hit the OpenRosa formList exactly as KoboCollect does, authenticating as the
collector account, to see which blank forms it is served. Read-only. Password
comes from the env (KOBO_COLLECT_PASSWORD) — never printed."""
import os, sys, re, requests
from requests.auth import HTTPBasicAuth
sys.stdout.reconfigure(encoding='utf-8')

USER = os.environ.get('KOBO_COLLECT_USER', 'baseline89')
PWD = os.environ.get('KOBO_COLLECT_PASSWORD', '')
if not PWD:
    sys.exit('set KOBO_COLLECT_PASSWORD')

auth = HTTPBasicAuth(USER, PWD)
# Endpoints KoboCollect may use, depending on the server URL entered.
urls = [
    'https://kc.kobotoolbox.org/formList',
    f'https://kc.kobotoolbox.org/{USER}/formList',
    'https://kf.kobotoolbox.org/formList',
]
for url in urls:
    try:
        r = requests.get(url, auth=auth, timeout=45,
                         headers={'X-OpenRosa-Version': '1.0'})
    except Exception as e:
        print(f'{url}\n   ERROR {e}\n'); continue
    titles = re.findall(r'<name>(.*?)</name>', r.text)
    ids = re.findall(r'<formID>(.*?)</formID>', r.text)
    print(f'{url}')
    print(f'   HTTP {r.status_code} | forms returned: {len(ids)}')
    for t, i in zip(titles, ids):
        print(f'     - {t}  [{i}]')
    if r.status_code != 200:
        print(f'   body: {r.text[:160]}')
    print()
