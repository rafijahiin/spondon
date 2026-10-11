# -*- coding: utf-8 -*-
"""Partner-coverage print sheets for the SIMPLE dashboard.

Same house style, boundary file and five-pass drawing as make_donor_maps.py
(fills and strokes separate, supported districts outlined heavier, generalised
stroke so the Sundarbans does not smear, scale bar, north arrow, legend laid
out in inches). Three sheets:

  PHD      9 wellness-centre districts, one centre each
  Bandhu   8 working districts
  SIMPLE   all three partners on one map, overlaps in their own colour

District lists are the canonical PARTNER_DISTRICTS from
frontend/src/data/partnerDistricts.ts. Change them there, then rerun this.

Writes a 150-dpi PNG into frontend/public/maps (served on the dashboard) and a
300-dpi PDF + PNG into the Desktop deliverable folder, from one run.
"""
import json
import math
import os
import re

import matplotlib
matplotlib.use('Agg')
import matplotlib.patheffects as pe
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon, Rectangle
from shapely.geometry import LineString

GEOJSON = r'C:\Users\HP\Documents\spondon_clone\frontend\public\bangladesh-adm2.geojson'
WEBDIR = r'C:\Users\HP\Documents\spondon_clone\frontend\public\maps'
DESK = r'C:\Users\HP\Desktop\SIMPLE_Dashboard_Maps'
WORK = os.path.join(DESK, '_work')
WEB_DPI, PRINT_DPI = 150, 300
DATED = '11 October 2026'

FONT = 'Atkinson Hyperlegible'
plt.rcParams['font.family'] = FONT
plt.rcParams['pdf.fonttype'] = 42

INK, ASH, HAIR = '#131619', '#686a6c', '#a8aeb4'
SEA, LAND = '#eef3f7', '#ece9e4'
BORDER, BORDER_LW = '#6f777e', 0.85
EDGE, EDGE_LW = '#26292c', 1.30

# Partner palette. Single partners take the dashboard's own partner tints
# (CIPRB pastel blue, Bandhu pastel green, PHD orange); a two-partner district
# takes a deeper tone of its own so the legend can name it rather than leaving
# the eye to guess a blend.
TINT = {
    'CIPRB':          '#649BF2',
    'Bandhu':         '#4E9A86',
    'PHD':            '#F96000',
    'CIPRB + Bandhu': '#16697A',
    'CIPRB + PHD':    '#B23A1E',
}

CIPRB = ['Sunamganj', 'Sherpur', 'Bhola', 'Kurigram', 'Gaibandha', 'Khagrachari',
         'Noakhali', 'Patuakhali', 'Sirajganj', 'Barguna', 'Jamalpur', 'Bagerhat',
         'Habiganj', 'Moulavibazar', 'Sylhet', 'Bandarban', 'Chandpur', 'Rangpur', 'Dhaka']
BANDHU = ['Sunamganj', 'Habiganj', 'Manikganj', 'Narayanganj', 'Chattogram',
          'Bandarban', 'Chandpur', 'Noakhali']
PHD = ['Rajbari', 'Jessore', 'Bagerhat', 'Patuakhali', 'Faridpur', 'Mymensingh',
       'Jamalpur', 'Tangail', 'Khulna']


def partner_class(d):
    inn = [p for p, lst in (('CIPRB', CIPRB), ('Bandhu', BANDHU), ('PHD', PHD)) if d in lst]
    return ' + '.join(inn)


# All-partners membership, each district to its class.
ALL = {}
for d in set(CIPRB) | set(BANDHU) | set(PHD):
    ALL[d] = partner_class(d)

SHEETS = {
    'PHD': {
        'title': 'PHD wellness-centre districts',
        'subtitle': 'SIDA-funded brothel-based wellness centres, one centre per district',
        'file': 'PHD_coverage',
        'classes': {d: 'PHD' for d in PHD},
        'legend': [('PHD', len(PHD))],
    },
    'Bandhu': {
        'title': 'Bandhu working districts',
        'subtitle': 'Bandhu Social Welfare Society service districts',
        'file': 'Bandhu_coverage',
        'classes': {d: 'Bandhu' for d in BANDHU},
        'legend': [('Bandhu', len(BANDHU))],
    },
    'SIMPLE': {
        'title': 'SIMPLE partner coverage',
        'subtitle': 'CIPRB, Bandhu and PHD districts on one map; a district worked by two partners is shown in its own colour',
        'file': 'SIMPLE_all_partners',
        'classes': ALL,
        'legend': [(c, sum(1 for v in ALL.values() if v == c))
                   for c in ('CIPRB', 'Bandhu', 'PHD', 'CIPRB + Bandhu', 'CIPRB + PHD')],
    },
}

# Leader offsets (deg) for names that cannot sit on their own small district.
LEADERS = {
    'Bhola': (-0.46, -0.46), 'Barguna': (-0.40, -0.22), 'Patuakhali': (-0.58, 0.02),
    'Chandpur': (-0.62, 0.26), 'Sherpur': (0.02, 0.34), 'Jamalpur': (-0.58, -0.06),
    'Noakhali': (0.62, -0.28), 'Narayanganj': (0.52, -0.12), 'Manikganj': (-0.52, 0.10),
    'Dhaka': (0.40, -0.30), 'Faridpur': (-0.48, -0.20), 'Rajbari': (-0.52, 0.06),
    'Tangail': (-0.40, 0.18),
}
ALIASES = {'khagrachari': 'khagrachhari', 'moulavibazar': 'maulvibazar',
           'chattogram': 'chittagong', 'cumilla': 'comilla', 'bogura': 'bogra',
           'jashore': 'jessore', 'barishal': 'barisal'}


def key(name):
    k = re.sub(r'[^a-z]', '', str(name).lower())
    return ALIASES.get(k, k)


def rings(geom):
    if geom['type'] == 'Polygon':
        return [geom['coordinates'][0]]
    if geom['type'] == 'MultiPolygon':
        return [poly[0] for poly in geom['coordinates']]
    return []


def biggest_ring(feat):
    best, best_area = None, 0.0
    for ring in rings(feat['geometry']):
        xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
        area = (max(xs) - min(xs)) * (max(ys) - min(ys))
        if area > best_area:
            best, best_area = ring, area
    return best


def centroid(ring):
    return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))


def thinned(ring, tol):
    if len(ring) < 5:
        return ring
    return list(LineString(ring).simplify(tol).coords)


def draw_map(ax, spec, geo, *, label_size=7.8):
    classes = {key(d): c for d, c in spec['classes'].items()}
    pretty = {key(d): d for d in spec['classes']}
    seen = set()
    ax.set_facecolor(SEA)
    labels, shaded_rings = [], []

    for feat in geo['features']:
        name = feat['properties'].get('shapeName', '')
        cls = classes.get(key(name))
        shaded = cls is not None
        if shaded:
            seen.add(key(name))
        for ring in rings(feat['geometry']):
            ax.add_patch(MplPolygon(ring, closed=True, edgecolor='none',
                                    facecolor=TINT[cls] if shaded else LAND, zorder=2))
            ax.plot(*zip(*thinned(ring, 0.004)), color=BORDER, linewidth=BORDER_LW,
                    solid_joinstyle='round', zorder=3)
            if shaded:
                shaded_rings.append(ring)
        if shaded:
            labels.append((centroid(biggest_ring(feat)), pretty[key(name)]))

    for ring in shaded_rings:
        bx = [p[0] for p in ring]; by = [p[1] for p in ring]
        if (max(bx) - min(bx)) * (max(by) - min(by)) < 0.0012:
            continue
        ax.plot(*zip(*thinned(ring, 0.009)), color=EDGE, linewidth=EDGE_LW,
                solid_joinstyle='round', zorder=4)

    missing = set(classes) - seen
    if missing:
        raise SystemExit(f'{spec["title"]}: not on the map file: {missing}')

    for (cx, cy), name in labels:
        dx, dy = LEADERS.get(name, (0.0, 0.0))
        tx, ty = cx + dx, cy + dy
        if dx or dy:
            ax.annotate('', xy=(cx, cy), xytext=(tx, ty), zorder=7,
                        arrowprops=dict(arrowstyle='-', color='#7a7a7a', linewidth=0.7,
                                        shrinkA=1, shrinkB=1))
        ax.text(tx, ty, name, ha='center', va='center', fontsize=label_size,
                color='#1a1a1a', zorder=8, fontweight='bold',
                path_effects=[pe.withStroke(linewidth=2.6, foreground='white')])

    xs = [p[0] for f in geo['features'] for r in rings(f['geometry']) for p in r]
    ys = [p[1] for f in geo['features'] for r in rings(f['geometry']) for p in r]
    ax.set_xlim(min(xs) - 0.12, max(xs) + 0.12)
    ax.set_ylim(min(ys) - 0.12, max(ys) + 0.12)
    ax.set_aspect(1 / math.cos(math.radians(23.7)))
    ax.set_xticks([]); ax.set_yticks([])
    for side in ax.spines.values():
        side.set_edgecolor(HAIR); side.set_linewidth(1.0)

    ax.annotate('N', xy=(0.962, 0.93), xytext=(0.962, 0.875),
                xycoords='axes fraction', textcoords='axes fraction',
                ha='center', va='center', fontsize=9.5, fontweight='bold', color=INK,
                arrowprops=dict(arrowstyle='-|>', color=INK, linewidth=1.1))

    km_per_deg = 111.32 * math.cos(math.radians(23.7))
    bar = 100 / km_per_deg
    x0, y0 = max(xs) - 0.05 - bar, min(ys) + 0.24
    for i in range(2):
        ax.add_patch(Rectangle((x0 + i * bar / 2, y0), bar / 2, 0.055,
                               facecolor=INK if i == 0 else 'white',
                               edgecolor=INK, linewidth=0.7, zorder=9))
    for frac, lab in ((0, '0'), (0.5, '50'), (1, '100 km')):
        ax.text(x0 + bar * frac, y0 - 0.1, lab, ha='center', va='top',
                fontsize=7, color=ASH, zorder=9)


def draw_legend(fig, rows, *, y, x0=0.06, x1=0.955, size=9.2):
    width_in = fig.get_size_inches()[0]
    sw, pad, gap = 0.26, 0.11, 0.34
    char = 0.56 * size / 72
    texts = [f'{lab}  ({n})' for lab, n in rows] + ['Not covered']
    rows2 = list(rows) + [('Not covered', None)]
    widths = [sw + pad + char * len(t) for t in texts]
    avail = (x1 - x0) * width_in
    span = sum(widths) + gap * (len(rows2) - 1)
    if span > avail:
        k = avail / span
        size, sw, pad, gap = size * k, sw * k, pad * k, gap * k
        widths = [w * k for w in widths]; span = avail
    x = (x0 * width_in) + (avail - span) / 2
    for (label, _), text, w in zip(rows2, texts, widths):
        fig.patches.append(Rectangle((x / width_in, y - 0.006), sw / width_in, 0.013,
                                     transform=fig.transFigure, figure=fig,
                                     facecolor=TINT.get(label, LAND),
                                     edgecolor='#00000022', linewidth=0.6))
        fig.text((x + sw + pad) / width_in, y, text, fontsize=size, color=INK, va='center')
        x += w + gap


def page(spec, geo):
    fig = plt.figure(figsize=(8.27, 11.69))     # A4 portrait
    fig.patch.set_facecolor('white')
    ax = fig.add_axes([0.06, 0.12, 0.88, 0.74])
    draw_map(ax, spec, geo)
    draw_legend(fig, spec['legend'], y=0.072)

    fig.text(0.06, 0.945, spec['title'], fontsize=21, fontweight='bold', color=INK)
    fig.text(0.06, 0.925, spec['subtitle'], fontsize=10.2, color=ASH)
    fig.add_artist(plt.Line2D([0.06, 0.94], [0.912, 0.912], color='#F96000',
                              linewidth=1.6, transform=fig.transFigure))
    n = len(spec['classes'])
    fig.text(0.06, 0.886, f'{n} districts', fontsize=10, color=INK, fontweight='bold')
    fig.text(0.94, 0.886, f'SIMPLE dashboard  ·  {DATED}', fontsize=9, color=ASH, ha='right')
    fig.text(0.06, 0.022, 'Boundaries: Bangladesh district boundaries (ADM2). '
             'A district worked by two partners is shown in its own colour.',
             fontsize=8, color=ASH)

    out = []
    web = os.path.join(WEBDIR, f'{spec["file"]}.png')
    fig.savefig(web, dpi=WEB_DPI, facecolor='white'); out.append(web)
    fig.savefig(os.path.join(WORK, f'{spec["file"]}.png'), dpi=PRINT_DPI, facecolor='white')
    pdf = os.path.join(DESK, f'{spec["file"]}.pdf')
    fig.savefig(pdf, dpi=PRINT_DPI, facecolor='white'); out.append(pdf)
    plt.close(fig)
    return out


os.makedirs(WEBDIR, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
geo = json.load(open(GEOJSON, encoding='utf-8'))
written = []
for spec in SHEETS.values():
    written += page(spec, geo)
for p in written:
    print(f'{os.path.getsize(p) / 1024:7.0f} KB  {p}')
