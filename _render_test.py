import sys
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf-8')

HTML = r'C:\Users\HP\Downloads\SIMPLE_monthly_pulse_SAMPLE.html'
OUT = r'C:\Users\HP\Downloads\SIMPLE_monthly_pulse_SAMPLE.png'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(device_scale_factor=2)
    pg.goto('file:///' + HTML.replace('\\', '/'))
    pg.wait_for_load_state('networkidle')
    pg.wait_for_timeout(1400)          # let web font + load animation settle
    pg.locator('.sheet').screenshot(path=OUT)
    b.close()
print('rendered ->', OUT)
