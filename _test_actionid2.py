import os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///db.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
import django; django.setup()
from programs.webhook import _flatten_group_keys
from programs.ciprb_handlers import handle_ciprb_mpdsr_action_plan
from mpdsr.models import MPDSRAction

MPDSRAction.objects.all().delete()
G = 'grp_new_plan'


def new_plan(aid, district, section, activity, status='pending', _id=1):
    p = {'_id': _id, '_submitted_by': 'ciprb_field', 'ap_mode': 'new_plan',
         'grp_meta/district': district, 'grp_meta/collection_date': '2026-06-25',
         f'{G}/action_id': aid, f'{G}/rp_section': section,
         f'{G}/act_activity': activity, f'{G}/act_status': status,
         f'{G}/act_responsible': 'UH&FPO'}
    return handle_ciprb_mpdsr_action_plan(_flatten_group_keys(p), None, None)


r = new_plan('KU-01', 'kurigram', 'system_strengthening', 'Form CDR committee', _id=1)
print('plan KU-01     ->', r.status_code, r.content.decode())
r = new_plan('KU-02', 'kurigram', 'community_va', 'Awareness sessions', _id=2)
print('plan KU-02     ->', r.status_code, r.content.decode())
r = new_plan('D-01', 'dhaka', 'facility_dr', 'Facility audit', _id=3)
print('plan D-01      ->', r.status_code, r.content.decode())
for a in MPDSRAction.objects.order_by('action_id'):
    print('   %-6s %-9s %-22s %-12s %s' % (a.action_id, a.district, a.section, a.status, a.activity[:26]))

upd = {'_id': 10, 'ap_mode': 'update_action', 'grp_meta/district': 'kurigram',
       'grp_update/ap_action_sel': 'ku-01', 'grp_update/ap_new_status': 'implemented',
       'grp_update/ap_new_completion': '100', 'grp_update/ap_completion_date': '2026-08-01'}
r = handle_ciprb_mpdsr_action_plan(_flatten_group_keys(upd), None, None)
print('update KU-01   ->', r.status_code, r.content.decode())
a = MPDSRAction.objects.get(action_id='KU-01')
print('   KU-01 now: status=%s completion=%s%%' % (a.status, a.completion_pct))

# re-register KU-01 — must NOT reset the advanced status
r = new_plan('KU-01', 'kurigram', 'system_strengthening', 'Form CDR committee v2', _id=11)
print('re-register    ->', r.status_code, r.content.decode())
a = MPDSRAction.objects.get(action_id='KU-01')
print('   KU-01 after re-register: status=%s (should stay implemented), activity=%r' % (a.status, a.activity[:24]))

# guard: no action_id
r = handle_ciprb_mpdsr_action_plan(_flatten_group_keys(
    {'_id': 12, 'ap_mode': 'new_plan', 'grp_meta/district': 'kurigram', f'{G}/act_activity': 'x'}), None, None)
print('no action_id   ->', r.status_code, r.content.decode())
print('\ntotal actions:', MPDSRAction.objects.count())
