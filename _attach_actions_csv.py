import os, io, csv, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'spondon.settings.production')
import django; django.setup()
from programs.management.commands.export_mpdsr_actions import (
    upload_to_kobo, redeploy_forms, CSV_FILENAME)

# Header-only CSV — attaches the select_one_from_file source so the dropdown is
# wired even before any action exists. The prod post_save signal replaces it
# with the real action list as soon as a plan is submitted.
buf = io.StringIO()
csv.writer(buf).writerow(['name', 'label', 'action_id', 'activity',
                          'responsible', 'timeline', 'district', 'status'])
b = buf.getvalue().encode('utf-8')


class O:
    def write(self, m):
        print(str(m).rstrip())


print('CSV:', CSV_FILENAME, len(b), 'bytes (header only)')
print('upload ok:', upload_to_kobo(b, O()))
print('redeploy ok:', redeploy_forms(O()))
