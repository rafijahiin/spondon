import json, re, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPoly, Patch
from matplotlib.collections import PatchCollection
import matplotlib.patheffects as pe

# Black-and-white-printable: hard light-vs-dark contrast (no hatching), black borders.
GEOJSON = r'C:\Users\HP\Documents\spondon_clone\frontend\public\bangladesh-adm2.geojson'
OUT_PNG = r'C:\Users\HP\Downloads\gender_diverse_coverage_map_bw.png'
OUT_PDF = r'C:\Users\HP\Downloads\gender_diverse_coverage_map_bw.pdf'

BANDHU = ['Sunamganj','Habiganj','Manikganj','Narayanganj','Chattogram','Bandarban','Chandpur','Noakhali']
PHD = ['Rajbari','Jessore','Bagerhat','Patuakhali','Faridpur','Mymensingh','Jamalpur','Tangail','Khulna']
ALIASES = {'khagrachari':'khagrachhari','patuakahli':'patuakhali','chittagong':'chattogram',
           'barishal':'barisal','cumilla':'comilla','bogura':'bogra','jashore':'jessore',
           'noakhli':'noakhali','moulavibazar':'maulvibazar'}
def norm(n):
    b = re.sub(r'[^a-z]', '', (n or '').lower())
    return ALIASES.get(b, b)
bandhu_keys = {norm(d) for d in BANDHU}
phd_keys = {norm(d) for d in PHD}

# Strong light-vs-dark contrast so the two partners are unmistakable in grayscale.
BANDHU_FC = '#4d4d4d'   # solid DARK grey  (labels white)
PHD_FC    = '#cfcfcf'   # solid LIGHT grey (labels black)
OTHER_FC  = '#ffffff'   # white
EDGE      = '#000000'   # solid black borders

DISPLAY = {'Chittagong': 'Chattogram'}
def name_of(f):
    return f['properties'].get('shapeName', '')
def display_of(f):
    return DISPLAY.get(name_of(f), name_of(f))

def rings(geom):
    if geom['type'] == 'Polygon':
        yield geom['coordinates'][0]
    else:
        for poly in geom['coordinates']:
            yield poly[0]

def shoelace(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0]*ring[i+1][1] - ring[i+1][0]*ring[i][1]
    return s * 0.5

def centroid(ring):
    A = shoelace(ring)
    if abs(A) < 1e-12:
        xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
        return sum(xs)/len(xs), sum(ys)/len(ys)
    cx = cy = 0.0
    for i in range(len(ring) - 1):
        cross = ring[i][0]*ring[i+1][1] - ring[i+1][0]*ring[i][1]
        cx += (ring[i][0] + ring[i+1][0]) * cross
        cy += (ring[i][1] + ring[i+1][1]) * cross
    return cx/(6*A), cy/(6*A)

g = json.load(open(GEOJSON, encoding='utf-8'))
patches_b, patches_p, patches_o, labels = [], [], [], []
for f in g['features']:
    key = norm(name_of(f))
    if key in bandhu_keys:   target, org = patches_b, 'Bandhu'
    elif key in phd_keys:    target, org = patches_p, 'PHD'
    else:                    target, org = patches_o, None
    biggest, biggest_area = None, -1.0
    for ring in rings(f['geometry']):
        target.append(MplPoly(ring, closed=True))
        a = abs(shoelace(ring))
        if a > biggest_area:
            biggest_area, biggest = a, ring
    if org and biggest is not None:
        cx, cy = centroid(biggest)
        labels.append((cx, cy, display_of(f), org))

fig, ax = plt.subplots(figsize=(9.6, 12.2))

def add(pl, fc):
    pc = PatchCollection(pl, match_original=False)
    pc.set_facecolor(fc)
    pc.set_edgecolor(EDGE)
    pc.set_linewidth(0.7)
    ax.add_collection(pc)

add(patches_o, OTHER_FC)
add(patches_b, BANDHU_FC)
add(patches_p, PHD_FC)

ax.autoscale_view()
ax.set_aspect(1 / math.cos(math.radians(23.7)))
ax.axis('off')

for cx, cy, nm, org in labels:
    if org == 'Bandhu':          # dark fill -> white label
        col, halo_c = 'white', '#1a1a1a'
    else:                        # light fill -> black label
        col, halo_c = 'black', 'white'
    halo = [pe.withStroke(linewidth=2.6, foreground=halo_c)]
    ax.annotate(nm, (cx, cy), ha='center', va='center',
                fontsize=8.4, fontweight='bold', color=col, path_effects=halo)

fig.suptitle('Geographical Coverage of the Project\nfor the Gender Diverse Population',
             fontsize=19, fontweight='bold', color='#000000', y=0.975)
ax.set_title('Wellness Centres — Bandhu Social Welfare Society  &  Partners in Health and Development (PHD)',
             fontsize=11, color='#222222', pad=14)

handles = [
    Patch(facecolor=BANDHU_FC, edgecolor=EDGE,
          label='Bandhu Social Welfare Society  ·  8 districts  (dark)'),
    Patch(facecolor=PHD_FC, edgecolor=EDGE,
          label='Partners in Health and Development (PHD)  ·  9 districts  (light)'),
]
leg = ax.legend(handles=handles, loc='lower left', frameon=True, fontsize=10.5,
                title='Wellness-centre coverage', title_fontsize=11, borderpad=1.0, labelspacing=0.9)
leg.get_frame().set_edgecolor('#000000'); leg.get_frame().set_facecolor('white')

fig.text(0.5, 0.018, 'UNFPA Bangladesh — Reproductive & Child Health programme   ·   Each district hosts one wellness centre',
         ha='center', fontsize=8.5, color='#333333')

plt.savefig(OUT_PNG, dpi=300, bbox_inches='tight', facecolor='white')
plt.savefig(OUT_PDF, bbox_inches='tight', facecolor='white')
print('WROTE', OUT_PNG)
print('WROTE', OUT_PDF)
print('labelled districts:', len(labels))
