import os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ.setdefault('DATABASE_URL', 'sqlite:///_rpt_test.sqlite3')
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
import django; django.setup()
from reports.generators.html_render import demo_data, render_report_pdf

narrative = [
    "June 2026 was the programme's strongest month to date, with 4,820 field activities recorded "
    "across all three partners — an 18% rise on May. Growth was led by PHD's outreach in Sunamganj "
    "and Bandhu's HIV/STI testing, while CIPRB sustained its monitoring and MPDSR coverage.",
    "Service delivery deepened across the board: 3,512 clients were registered, 2,067 individual "
    "counselling sessions delivered, and 1,284 HIV/STI tests completed. Referral completion rose to "
    "311, and 96 GBV survivors were supported through the network.",
    "Looking ahead, July's focus is sustaining the referral-completion gains and closing the "
    "remaining MPDSR action items, now tracked per action by the new committee follow-up tool.",
]
pdf = render_report_pdf(demo_data(), narrative=narrative, is_sample=True)
open(r'C:\Users\HP\Downloads\report_overall.pdf', 'wb').write(pdf)
print('report ->', len(pdf), 'bytes')
