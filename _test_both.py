import os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ['DJANGO_SETTINGS_MODULE'] = 'spondon.settings.development'
os.environ.setdefault('DATABASE_URL', 'sqlite:///_rpt_test.sqlite3')
os.environ.setdefault('SECRET_KEY', 'test')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', '*')
import django; django.setup()
from django.template.loader import render_to_string
from reports.generators.html_render import (demo_data, render_pptx, render_slides_pngs,
                                             web_report_html, report_context)

AI = ("June was the programme's strongest month yet — 4,820 field activities, up 18% on May, "
      "led by PHD outreach in Sunamganj and Bandhu HIV/STI testing.")

# ── PowerPoint ──
pptx = render_pptx(demo_data(), is_sample=True)
open(r'C:\Users\HP\Downloads\board_deck.pptx', 'wb').write(pptx)
print('pptx ->', len(pptx), 'bytes')
slides_html = render_to_string('reports/slides.html', report_context(demo_data(), is_sample=True))
pngs = render_slides_pngs(slides_html, '.slide')
open(r'C:\Users\HP\Downloads\slide_cover.png', 'wb').write(pngs[0])
open(r'C:\Users\HP\Downloads\slide_partner.png', 'wb').write(pngs[3])
print('slides:', len(pngs))

# ── Web report (full-page) ──
html = web_report_html(demo_data(), is_sample=True, ai_summary=AI)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1120, 'height': 900}, device_scale_factor=2)
    pg.set_content(html, wait_until='load')
    try:
        pg.wait_for_load_state('networkidle', timeout=8000)
    except Exception:
        pass
    pg.wait_for_timeout(2200)
    pg.screenshot(path=r'C:\Users\HP\Downloads\web_report.png', full_page=True)
    b.close()
print('web report done')
