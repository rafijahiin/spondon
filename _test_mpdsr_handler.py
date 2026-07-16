import os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///_mpdsr_test.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test-only-key')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
import django
django.setup()
from django.core.management import call_command
call_command('migrate', verbosity=0)

from programs.ciprb_handlers import (
    handle_ciprb_mpdsr_community_maternal as f1,
    handle_ciprb_mpdsr_community_neonatal as f2,
    handle_ciprb_mpdsr_facility_maternal as f4,
    handle_ciprb_mpdsr_facility_neonatal as f5,
    handle_ciprb_social_autopsy as fsa)
from mpdsr.models import MPDSRCase

def run(tag, fn, p):
    try:
        r = fn(p, 24.9, 91.4)
        print('%-4s -> %s %s' % (tag, r.status_code, (r.content or b'')[:30]))
    except Exception as e:
        print('%-4s -> EXC %r' % (tag, e))

# Synthetic submissions using the VERBATIM field names from each form.
run('F01', f1, {'_id': 't1', 'district': 'sunamganj', 'death_date': '2026-05-01',
    'death_time': '14:30', 'icd_cause': 'eclampsia', 'death_place': 'home',
    'deceased_age': '27', 'gestation_week': '36', 'anc_count': '4', 'pnc_count': '2',
    'delivery_mode': 'normal', 'delivery_outcome': 'live', 'delivery_place': 'home',
    'delivery_conductor': 'tba', 'death_after_delivery_h': '5', 'consent_given': 'yes',
    'cause_opinion': 'bled heavily after delivery', 'case_serial': 'M-001'})
run('F02', f2, {'_id': 't2', 'district': 'habiganj', 'death_date': '2026-05-02',
    'death_time': '03:00', 'icd_cause': 'asphyxia', 'death_place': 'union_hfwc',
    'mother_age': '24', 'gestation_week': '38', 'anc_count': '3', 'delivery_mode': 'normal',
    'birth_place': 'union_hfwc', 'delivery_conductor': 'csba', 'consent_given': 'yes',
    'cause_opinion': 'did not cry at birth', 'case_serial': 'N-001'})
run('F04', f4, {'_id': 't4', 'district': 'noakhali', 'date_of_death': '2026-05-03',
    'time_of_death': '09:15', 'cause_of_death': 'O72', 'death_place_facility': 'labour_ward',
    'deceased_age': '31', 'facility_name': 'District Hospital', 'admission_date': '2026-05-02',
    'delivery_mode': 'caesarean', 'delivery_outcome': 'live', 'death_narrative': 'PPH after CS',
    'case_serial': 'FM-001'})
run('F05', f5, {'_id': 't5', 'district': 'bandarban', 'death_date': '2026-05-04',
    'death_time': '22:00', 'cod_cause': 'sepsis', 'place_of_death_facility': 'scanu',
    'mother_age': '29', 'facility_name': 'Sadar Hospital', 'admission_date': '2026-05-03',
    'birth_place': 'home', 'age_death_hours': '40', 'death_narrative': 'late-onset sepsis',
    'case_serial': 'FN-001'})

# Backward-compat: OLD field names (already-processed submissions) + Social Autopsy.
run('OLD', f1, {'_id': 'told', 'district': 'sylhet', 'date_of_death': '2026-04-01',
    'cause_of_death': 'haemorrhage', 'place_of_death': 'home', 'deceased_age': '30',
    'time_of_death': '10:00', 'gestational_weeks': '40', 'anc_visits_count': '4',
    'mode_of_delivery': 'normal', 'consent_given': 'yes', 'case_serial': 'OLD-1'})
run('SA', fsa, {'_id': 'tsa', 'district': 'sylhet', 'date_of_death': '2026-04-02',
    'cause_brief': 'delayed care seeking', 'place_of_death': 'in_transit',
    'delay1_factors': 'late decision', 'delay2_factors': 'no transport',
    'consent_given': 'yes', 'case_serial': 'SA-1'})

print('\n--- resulting cases ---')
for c in MPDSRCase.objects.all().order_by('sub_form_type'):
    print('%-4s dod=%s cause=%-12r place=%-10s age=%s time=%-6r gw=%s anc=%r mode=%r del_place=%r notes=%r' % (
        c.sub_form_type, c.date_of_death, c.cause_of_death, c.place_of_death, c.age_years,
        c.time_of_death, c.gestational_weeks, c.anc_visits_count, c.mode_of_delivery,
        c.place_of_delivery, (c.notes or '')[:24]))
print('total cases:', MPDSRCase.objects.count())
