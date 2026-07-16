"""Generate two labelled QR codes for the CIPRB baseline survey forms and save
them to the Desktop. Each QR encodes the form's online-offline (multiple
submission) collection URL, so a field worker scans it and the form opens on
their phone (works offline once loaded)."""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

DESKTOP = os.path.join(os.path.expanduser('~'), 'Desktop')

FORMS = [
    {
        'file': 'Baseline_QR_Hijra.png',
        'url': 'https://ee.kobotoolbox.org/x/tzGBA7nj',
        'title': 'CIPRB Baseline Survey',
        'subtitle': 'Hijra / Gender-diverse Population',
        'accent': (194, 60, 0),      # UNFPA-ish deep orange
    },
    {
        'file': 'Baseline_QR_FSW.png',
        'url': 'https://ee.kobotoolbox.org/x/83PhCEZ4',
        'title': 'CIPRB Baseline Survey',
        'subtitle': 'Female Sex Workers (Brothel & Street)',
        'accent': (11, 61, 145),     # blue (matches the FSW tag)
    },
]


def font(path_candidates, size):
    for p in path_candidates:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


BOLD = ['C:/Windows/Fonts/arialbd.ttf', 'arialbd.ttf']
REG = ['C:/Windows/Fonts/arial.ttf', 'arial.ttf']
MONO = ['C:/Windows/Fonts/consola.ttf', 'cour.ttf']


def centered(draw, y, text, fnt, fill, width):
    w = draw.textbbox((0, 0), text, font=fnt)[2]
    draw.text(((width - w) / 2, y), text, font=fnt, fill=fill)


for f in FORMS:
    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_H,
                       box_size=12, border=2)
    qr.add_data(f['url'])
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color='black', back_color='white').convert('RGB')

    W = 1000
    qr_img = qr_img.resize((720, 720), Image.NEAREST)
    top_pad, gap, bottom_pad = 150, 34, 150
    H = top_pad + qr_img.height + bottom_pad

    card = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(card)

    accent = f['accent']
    d.rectangle([0, 0, W, 12], fill=accent)                 # top accent bar

    centered(d, 40, f['title'], font(BOLD, 46), (20, 20, 20), W)
    centered(d, 96, f['subtitle'], font(REG, 30), accent, W)

    card.paste(qr_img, ((W - qr_img.width) // 2, top_pad))

    cy = top_pad + qr_img.height + gap
    centered(d, cy, 'Scan with your phone camera to open the form',
             font(REG, 26), (60, 60, 60), W)
    centered(d, cy + 40, 'Works offline once loaded  ·  KoboToolbox',
             font(REG, 22), (120, 120, 120), W)
    centered(d, cy + 78, f['url'], font(MONO, 20), (150, 150, 150), W)

    out = os.path.join(DESKTOP, f['file'])
    card.save(out, 'PNG')
    print('WROTE', out, f"({card.width}x{card.height})")
