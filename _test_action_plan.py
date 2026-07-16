import os, sys, traceback
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///_mpdsr_test.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test-only-key')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
import django; django.setup()
from django.core.management import call_command
call_command('migrate', verbosity=0)
from programs.ciprb_handlers import handle_ciprb_mpdsr_action_plan as ap
from mpdsr.models import MPDSRAction
from django.db.models import Avg

def run(tag, p):
    try:
        r = ap(p, 23.8, 90.4)
        print('%-11s -> %s %s' % (tag, r.status_code, (r.content or b'')[:26]))
    except Exception as e:
        traceback.print_exc(); print('%-11s -> EXC %r' % (tag, e))

run('Dhaka new', {'_id': 'plan1', 'district': 'dhaka', 'ap_mode': 'new_plan', 'meeting_date': '2026-06-20',
    'grp_sys_act': [
        {'sys_subcat': 'Community Death Review', 'sys_activity': 'Train CHCPs on notification', 'sys_responsible': 'UH&FPO', 'sys_timeline': '2026-08-31', 'sys_indicator': '% trained', 'sys_status': 'pending', 'sys_completion': '0'},
        {'sys_subcat': 'Facility Death Review', 'sys_activity': 'Form FDR committee', 'sys_responsible': 'RMO', 'sys_timeline': '2026-07-31', 'sys_status': 'in_progress', 'sys_completion': '25'}],
    'grp_community_va_act': [
        {'community_va_activity': 'Awareness on danger signs', 'community_va_responsible': 'FWA', 'community_va_timeline': '2026-01-30', 'community_va_status': 'pending', 'community_va_completion': '0'}],
    'grp_facility_dr_act': [
        {'facility_dr_activity': 'Ensure MgSO4 stock', 'facility_dr_responsible': 'Pharmacist', 'facility_dr_timeline': '2026-07-15', 'facility_dr_status': 'implemented', 'facility_dr_completion': '100'}]})

run('Sunam new', {'_id': 'plan2', 'district': 'sunamganj', 'ap_mode': 'new_plan', 'meeting_date': '2026-06-21',
    'grp_sys_act': [{'sys_subcat': 'Monitoring and evaluation', 'sys_activity': 'Monthly review meeting', 'sys_responsible': 'CS', 'sys_timeline': '2026-10-31', 'sys_status': 'pending', 'sys_completion': '0'}]})

run('Update D-01', {'_id': 'upd1', 'ap_mode': 'update_action', 'ap_action_sel': 'd-01',
    'ap_new_status': 'implemented', 'ap_new_completion': '100', 'ap_completion_date': '2026-08-20', 'ap_remarks': 'training done'})

# Kobo nested-repeat format: grp_new_plan -> grp_sys_strengthen -> grp_sys_act
run('Nested fmt', {'_id': 'pn', 'district': 'dhaka', 'ap_mode': 'new_plan', 'meeting_date': '2026-06-22',
    'grp_new_plan': {'grp_sys_strengthen': {'grp_sys_act': [
        {'sys_subcat': 'Facility Death Review', 'sys_activity': 'Nested-format action', 'sys_responsible': 'RMO', 'sys_status': 'pending', 'sys_completion': '0'}]}}})
# Slash-key top-level format (raw Kobo, before the dispatcher aliases it)
run('Slash fmt', {'_id': 'ps', 'district': 'dhaka', 'ap_mode': 'new_plan', 'meeting_date': '2026-06-22',
    'grp_new_plan/grp_community_va/grp_community_va_act': [
        {'community_va_activity': 'Slash-key action', 'community_va_responsible': 'FWA', 'community_va_status': 'pending', 'community_va_completion': '0'}]})

print('\n--- actions ---')
for a in MPDSRAction.objects.all().order_by('district', 'action_id'):
    print('%-7s %-11s sec=%-22s status=%-12s pct=%3d overdue=%-5s act=%r' % (
        a.action_id, a.district, a.section, a.status, a.completion_pct, a.is_overdue, a.activity[:26]))

print('\ncumulative completion %% (all):', round(MPDSRAction.objects.aggregate(x=Avg('completion_pct'))['x'] or 0, 1))
for d in ('Dhaka', 'Sunamganj'):
    print('  %-10s' % d, round(MPDSRAction.objects.filter(district=d).aggregate(x=Avg('completion_pct'))['x'] or 0, 1))
print('total actions:', MPDSRAction.objects.count())
