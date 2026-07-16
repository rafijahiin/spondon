import os, sys, copy
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ.setdefault('DATABASE_URL', 'sqlite:///_rpt_test.sqlite3')
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
import django; django.setup()
from reports.generators.html_render import demo_data, render_infographic_png

png = render_infographic_png(
    demo_data(), is_sample=True,
    ai_summary="June saw the programme's strongest month yet — field activity rose 18% on May, "
               "driven by PHD outreach in Sunamganj and Bandhu HIV/STI testing. Referral completion "
               "and MPDSR reviews both improved; fistula identification held steady.")
open(r'C:\Users\HP\Downloads\infographic_overall.png', 'wb').write(png)
print('overall ->', len(png), 'bytes')

d = copy.deepcopy(demo_data())
d['organisation'] = 'PHD'; d['total_submissions'] = 2140; d['by_partner'] = {}
png2 = render_infographic_png(
    d, is_sample=True,
    ai_summary="PHD led June with strong outreach across 9 districts; HIV/STI testing and "
               "counselling both rose on May.")
open(r'C:\Users\HP\Downloads\infographic_PHD.png', 'wb').write(png2)
print('PHD ->', len(png2), 'bytes')
