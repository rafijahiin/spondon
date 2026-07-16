import os, requests, sys
sys.stdout.reconfigure(encoding='utf-8')
tok = (os.environ.get('KOBO_API_TOKEN') or '').strip()
H = {'Authorization': f'Token {tok}'}
for name, uid in [('FSW', 'aVsJ7VJ35k8GshpQpnXygC'), ('Hijra', 'aBT7aCL9p4FGcW4WwXZcr6')]:
    a = requests.get(f'https://kf.kobotoolbox.org/api/v2/assets/{uid}/?format=json', headers=H, timeout=90).json()
    names = [r.get('name') for r in a.get('content', {}).get('survey', [])]
    def h(n): return n in names
    print(f'\n{name}  deployed_version={a.get("deployed_version_id")}  rows={len(names)}')
    if name == 'FSW':
        print('  perp_12mo (Q7.1 i / Q7.14 a):', h('q7_1_i_perp_12mo'), '/', h('q7_14_a_perp_12mo'))
        print('  q9_10_other added:', h('q9_10_other'))
        print('  timing notes:', h('interview_start_note'), h('interview_end_note'))
        print('  sup_date/de_date REMOVED:', not h('sup_date'), not h('de_date'), '| dc_date kept:', h('dc_date'))
    else:
        print('  perp_12mo (Q7.1 a):', h('q7_1_a_perp_12mo'), '| q2_13_other:', h('q2_13_other'), '| q9_9_other:', h('q9_9_other'))
        print('  timing notes:', h('interview_start_note'), h('interview_end_note'))
        print('  verified_date/entry_date REMOVED:', not h('module9_verified_date'), not h('module9_entry_date'))
