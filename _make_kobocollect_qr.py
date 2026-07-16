"""Generate a KoboCollect (KoboToolbox app) configuration QR code.

Scanning it in KoboCollect -> Settings -> 'Configure via QR code' logs the app
into the CIPRB collector account, after which BOTH baseline forms appear under
'Get Blank Form'. The QR payload is the ODK/KoboCollect settings format:
base64( zlib.compress( JSON ) ).

Credentials come from the environment so the password never lands in this file
or the chat:
    PowerShell:  $env:KOBO_COLLECT_PASSWORD='<pwd>'; $env:KOBO_COLLECT_USER='ciprb123'; python _make_kobocollect_qr.py
"""
import base64
import json
import os
import sys
import zlib

sys.stdout.reconfigure(encoding='utf-8')
import qrcode
from qrcode.constants import ERROR_CORRECT_M
from PIL import Image, ImageDraw, ImageFont

DESKTOP = os.path.join(os.path.expanduser('~'), 'Desktop')
SERVER = os.environ.get('KOBO_COLLECT_SERVER', 'https://kc.kobotoolbox.org')
USER = os.environ.get('KOBO_COLLECT_USER', 'ciprb123')
PWD = os.environ.get('KOBO_COLLECT_PASSWORD', '')

if not PWD:
    sys.exit("Set KOBO_COLLECT_PASSWORD (the collector account password) in the "
             "environment first — it is never written to disk or echoed.\n"
             "PowerShell:  $env:KOBO_COLLECT_PASSWORD='...'; python _make_kobocollect_qr.py")

settings = {
    "general": {
        "server_url": SERVER, "username": USER, "password": PWD,
        # Auto-download: "match_exactly" pulls every form on the account right
        # after config and keeps them synced, so the enumerator never taps
        # "Get Blank Form" — both baseline forms just appear under Fill Blank Form.
        "form_update_mode": "match_exactly",
        "automatic_update": True,
        "periodic_form_updates_check": "every_one_hour",
    },
    "admin": {},
    # Modern KoboCollect/ODK (v2022.3+) creates & activates a named project from
    # this block on scan; without it some versions import settings but leave the
    # connection inactive → "Get Blank Form" shows blank.
    "project": {"name": "CIPRB Baseline", "icon": "C", "color": "#C23C00"},
}
payload = base64.b64encode(
    zlib.compress(json.dumps(settings).encode('utf-8'))
).decode('ascii')

qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=11, border=2)
qr.add_data(payload)
qr.make(fit=True)
qr_img = qr.make_image(fill_color='black', back_color='white').convert('RGB')
qr_img = qr_img.resize((760, 760), Image.NEAREST)


def font(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


BOLD = ['C:/Windows/Fonts/arialbd.ttf']
REG = ['C:/Windows/Fonts/arial.ttf']


def centered(d, y, text, fnt, fill, width):
    w = d.textbbox((0, 0), text, font=fnt)[2]
    d.text(((width - w) / 2, y), text, font=fnt, fill=fill)


W = 1000
top, bottom = 150, 150
H = top + qr_img.height + bottom
card = Image.new('RGB', (W, H), 'white')
d = ImageDraw.Draw(card)
accent = (194, 60, 0)
d.rectangle([0, 0, W, 12], fill=accent)
centered(d, 40, 'CIPRB Baseline — KoboCollect Setup', font(BOLD, 40), (20, 20, 20), W)
centered(d, 96, 'Scan in KoboCollect  ›  Settings  ›  Configure via QR code',
         font(REG, 26), accent, W)
card.paste(qr_img, ((W - qr_img.width) // 2, top))
cy = top + qr_img.height + 34
centered(d, cy, 'Loads the collector account — both baseline forms then appear',
         font(REG, 25), (60, 60, 60), W)
centered(d, cy + 38, "under  'Get Blank Form'  (Hijra + FSW).",
         font(REG, 25), (60, 60, 60), W)
centered(d, cy + 82, f'Server {SERVER}   ·   User {USER}',
         font(REG, 21), (140, 140, 140), W)

out = os.path.join(DESKTOP, 'KoboCollect_Config_QR.png')
card.save(out, 'PNG')
print('WROTE', out, f'({card.width}x{card.height})')
print('payload bytes:', len(payload), '| server:', SERVER, '| user:', USER)
