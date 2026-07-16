import os, sys
sys.stdout.reconfigure(encoding='utf-8')
from cryptography.fernet import Fernet
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///_enc_test.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
os.environ['FERNET_KEY'] = Fernet.generate_key().decode()   # real key, like prod
import django; django.setup()
from django.core.management import call_command
call_command('migrate', verbosity=0, interactive=False)

from fistula.ciprb_models import CIPRBFistulaCase
from mpdsr.ciprb_models import MPDSRDeathNotification, MaternalNearMissCase
from django.db import connection

CIPRBFistulaCase.objects.all().delete()
MPDSRDeathNotification.objects.all().delete()
MaternalNearMissCase.objects.all().delete()

f = CIPRBFistulaCase.objects.create(patient_code='1-0001', district='Sunamganj',
    name='Rahima Begum', husband='Karim Mia', contact_number='01711000000')
d = MPDSRDeathNotification.objects.create(district='Bhola', death_kind='maternal',
    deceased_name='Ayesha Khatun', deceased_address='Char Fasson',
    date_of_death='2026-06-01', reporter_name='Hosne Ara', reporter_mobile='01822000000')
m = MaternalNearMissCase.objects.create(district='Dhaka', woman_name='Salma Akter',
    event_date='2026-06-02', enumerator_name='Worker', enumerator_mobile='01933000000')

# 1. ORM read → decrypted plaintext
f2 = CIPRBFistulaCase.objects.get(pk=f.pk)
d2 = MPDSRDeathNotification.objects.get(pk=d.pk)
m2 = MaternalNearMissCase.objects.get(pk=m.pk)
print('READ  fistula name=%r husband=%r contact=%r' % (f2.name, f2.husband, f2.contact_number))
print('READ  death deceased=%r address=%r reporter=%r' % (d2.deceased_name, d2.deceased_address, d2.reporter_name))
print('READ  mnm   woman=%r enumerator=%r' % (m2.woman_name, m2.enumerator_name))

# 2. raw DB bytes → ciphertext, NOT plaintext
with connection.cursor() as cur:
    cur.execute('SELECT name FROM fistula_ciprbfistulacase LIMIT 1')
    rawf = cur.fetchone()[0] or ''
    cur.execute('SELECT deceased_name FROM mpdsr_mpdsrdeathnotification LIMIT 1')
    rawd = cur.fetchone()[0] or ''
print('\nRAW@REST fistula name : %s…  (plaintext leaked: %s)' % (rawf[:32], 'Rahima Begum' in rawf))
print('RAW@REST death deceased: %s…  (plaintext leaked: %s)' % (rawd[:32], 'Ayesha Khatun' in rawd))

ok = (f2.name == 'Rahima Begum' and d2.deceased_name == 'Ayesha Khatun'
      and m2.woman_name == 'Salma Akter'
      and 'Rahima' not in rawf and 'Ayesha' not in rawd)
print('\nENCRYPTION ROUND-TRIP OK:', ok)
sys.exit(0 if ok else 2)
