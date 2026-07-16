import os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///db.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
import django; django.setup()

from programs.webhook import _flatten_group_keys
from programs.ciprb_handlers import handle_ciprb_mpdsr_action_plan, _repeat
from mpdsr.models import MPDSRAction

MPDSRAction.objects.all().delete()

P = 'grp_new_plan/grp_sys_strengthen/grp_sys_act'
C = 'grp_new_plan/grp_community_va/grp_community_va_act'
F = 'grp_new_plan/grp_facility_dr/grp_facility_dr_act'


def sys_item(act, **kw):
    d = {P + '/sys_activity': act}
    for k, v in kw.items():
        d[P + '/sys_' + k] = v
    return d


# ── 1. multi-action, multi-section, real nested-slash; facility = empty placeholder
payload1 = {
    '_id': 1001, '_submitted_by': 'ciprb_field',
    'grp_meta/district': 'kurigram', 'grp_meta/collection_date': '2026-06-20',
    'ap_mode': 'new_plan',
    P: [
        sys_item('Form community death review committee', subcat='community_death_review',
                 responsible='UH&FPO', timeline='2026-07-15', status='pending'),
        sys_item('Train reviewers on cause assignment', status='in_progress'),
    ],
    C: [{C + '/community_va_activity': 'Community awareness on danger signs',
         C + '/community_va_responsible': 'FWA', C + '/community_va_status': 'pending'}],
    F: '',   # 0-instance repeat → Kobo scalar placeholder — must NOT break the others
}
flat = _flatten_group_keys(payload1)
print('repeat lens  sys=%d community=%d facility(placeholder)=%d'
      % (len(_repeat(flat, 'grp_sys_act')), len(_repeat(flat, 'grp_community_va_act')),
         len(_repeat(flat, 'grp_facility_dr_act'))))
r1 = handle_ciprb_mpdsr_action_plan(flat, None, None)
print('plan 1 ->', r1.status_code, r1.content.decode())
for a in MPDSRAction.objects.order_by('action_id'):
    print('   %-6s %-22s %s' % (a.action_id, a.section, a.activity[:38]))

# ── 2. second plan, same district → ids must CONTINUE (KU-04…)
payload2 = {'_id': 1002, '_submitted_by': 'ciprb_field',
            'grp_meta/district': 'kurigram', 'grp_meta/collection_date': '2026-06-21',
            'ap_mode': 'new_plan',
            P: [sys_item('Strengthen referral linkage', status='pending')]}
r2 = handle_ciprb_mpdsr_action_plan(_flatten_group_keys(payload2), None, None)
print('plan 2 ->', r2.status_code, r2.content.decode())
print('all KU ids:', list(MPDSRAction.objects.order_by('action_id').values_list('action_id', flat=True)))

# ── 3. update_action: advance KU-01 (lowercase select, like the form's pulldata)
upd = {'_id': 2001, 'ap_mode': 'update_action', 'grp_meta/district': 'kurigram',
       'ap_action_sel': 'ku-01', 'ap_new_status': 'implemented',
       'ap_new_completion': '100', 'ap_completion_date': '2026-08-01',
       'ap_remarks': 'Committee formed and active'}
r3 = handle_ciprb_mpdsr_action_plan(_flatten_group_keys(upd), None, None)
print('update ->', r3.status_code, r3.content.decode())
a = MPDSRAction.objects.get(action_id='KU-01')
print('KU-01 now:', a.status, a.completion_pct, '%', a.completion_date,
      '| raw_payload stored:', bool(a.raw_payload))

# ── 4. empty plan → loud 0-action warning, not silent
empty = {'_id': 1003, 'grp_meta/district': 'kurigram', 'ap_mode': 'new_plan'}
r4 = handle_ciprb_mpdsr_action_plan(_flatten_group_keys(empty), None, None)
print('empty plan ->', r4.status_code, r4.content.decode())
