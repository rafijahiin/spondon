import os, sys, time, requests
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
API = 'https://kf.kobotoolbox.org/api/v2'
UID = 'a7PgkrZcH8gMxqsdgkf6fF'  # Service Log

def hook():
    r = requests.get(f'{API}/assets/{UID}/hooks/?format=json', headers=H, timeout=40).json()
    return (r.get('results') or [None])[0]

h = hook(); hid = h['uid']
print(f"Service Log hook {hid} — start ok={h.get('success_count')} fail={h.get('failed_count')}")
cleared = False
for attempt in range(1, 13):           # ~12 × 40s ≈ 8 min, covers the deploy
    requests.patch(f'{API}/assets/{UID}/hooks/{hid}/retry/', headers=H, timeout=90)
    time.sleep(40)
    h = hook()
    sc, fc, pc = h.get('success_count'), h.get('failed_count'), h.get('pending_count')
    print(f'  attempt {attempt}: ok={sc} fail={fc} pending={pc}')
    if (fc or 0) == 0 and (pc or 0) == 0:
        cleared = True; break
print('RESULT:', 'ALL 6 CLEARED — counseling now processes end-to-end'
      if cleared else 'still failing — deploy may need more time; re-run _bandhu_retry_poll.py later')
