import os, sys, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
# Fistula assets seen earlier + any other; print offline links to match /x/fgFVgdrF
UIDS = {
    'CIPRB 1 Question Bank (LIVE)': 'aH86Euq2AeJ8S9VYdry4PC',
    'CIPRB Fistula Campaign (LIVE)': 'aso6xsUo8PMYRCzGQBc8Cm',
    'CIPRB 1 Question Bank (inactive)': 'aUEcJfPyVkwoQwBywMedYk',
}
for name, uid in UIDS.items():
    try:
        a = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=90).json()
        links = a.get('deployment__links') or {}
        off = links.get('offline_url', '')
        print(f"{name:34} uid={uid} rows={len(a.get('content',{}).get('survey',[]))} subs={a.get('deployment__submission_count')} OFFLINE={off}  {'<== fgFVgdrF' if 'fgFVgdrF' in (off or '') else ''}")
    except Exception as e:
        print(f'{name} ERR {repr(e)[:50]}')
