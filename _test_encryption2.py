import os, sys
sys.stdout.reconfigure(encoding='utf-8')
from cryptography.fernet import Fernet
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ['DATABASE_URL'] = 'sqlite:///_enc_test2.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
os.environ['FERNET_KEY'] = Fernet.generate_key().decode()
import django; django.setup()
from django.core.management import call_command
call_command('migrate', verbosity=0, interactive=False)

from mpdsr.ciprb_models import MPDSRDeathNotification, MaternalNearMissCase
from programs.ciprb_handlers import _save_notification, handle_ciprb_near_miss
from programs.models import Client
from django.db import connection

# 1. DEDUP must still work (deceased_name / woman_name are plaintext keys)
MPDSRDeathNotification.objects.all().delete()
p = {'district': 'bhola', 'date_of_death': '2026-06-01', 'deceased_name': 'Ayesha Khatun',
     'deceased_address': 'Char Fasson', 'reporter_name': 'Hosne Ara', 'reporter_mobile': '01822000000',
     'death_kind': 'maternal', '_id': '111', '_submitted_by': 'kobo'}
_save_notification(p, None, None, MPDSRDeathNotification.SLIP_01)
_save_notification(p, None, None, MPDSRDeathNotification.SLIP_01)   # Kobo re-delivery
n = MPDSRDeathNotification.objects.count()
print('death-notification dedup -> %d row (want 1)' % n)

MaternalNearMissCase.objects.all().delete()
nm = {'district': 'dhaka', 'event_date': '2026-06-02', 'woman_name': 'Salma Akter', '_id': '222'}
handle_ciprb_near_miss(nm, None, None)
handle_ciprb_near_miss(nm, None, None)                             # re-delivery
nmn = MaternalNearMissCase.objects.count()
print('near-miss dedup          -> %d row (want 1)' % nmn)

# 2. ENCRYPTION: deceased_address encrypted (ciphertext); deceased_name plaintext (key)
d = MPDSRDeathNotification.objects.first()
print('READ deceased_name=%r address=%r reporter=%r' % (d.deceased_name, d.deceased_address, d.reporter_name))
with connection.cursor() as cur:
    cur.execute('SELECT deceased_name, deceased_address FROM mpdsr_mpdsrdeathnotification LIMIT 1')
    rn, ra = cur.fetchone()
print('RAW  deceased_name=%r (PLAINTEXT key ok) | deceased_address=%s… (ciphertext: %s)'
      % (rn, (ra or '')[:18], 'Char Fasson' not in (ra or '')))

# 3. field types
print('Client.name=%s  mother_name=%s  current_address=%s' % (
    type(Client._meta.get_field('name')).__name__,
    type(Client._meta.get_field('mother_name')).__name__,
    type(Client._meta.get_field('current_address')).__name__))

ok = (n == 1 and nmn == 1 and d.deceased_name == 'Ayesha Khatun'
      and d.deceased_address == 'Char Fasson' and rn == 'Ayesha Khatun'
      and 'Char Fasson' not in (ra or '')
      and type(Client._meta.get_field('mother_name')).__name__ == 'EncryptedCharField')
print('\nDEDUP-INTACT + ENCRYPTION OK:', ok)
sys.exit(0 if ok else 2)
