"""
The monthly POSTER — a true infographic, not the report shrunk.

One key message, portrait 1080x1350 (the WhatsApp/Facebook share ratio the
partners actually use). English throughout (Rafi, 2026-08-08).

Composition: brand strip → Bangla headline → the one hero number with its
12-month shape → four bilingual chips → ONE bar block (the org's main story)
→ coverage line → footer. Nothing else; the report exists for the rest.
"""
from __future__ import annotations

from .brand import (BN_FONT, EN_FONT, FAINT, FONT_LINK, INK, LINE, MUTED,
                    ORANGE, ORANGE_DEEP, PAPER, SOFT, esc, fmt, spark_path)

_W, _H = 1080, 1350

_CSS = f"""
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ background:#22262A; }}
.poster {{ width:{_W}px; height:{_H}px; background:{PAPER}; position:relative;
           font-family:{EN_FONT}; color:{INK}; overflow:hidden;
           display:flex; flex-direction:column; padding:58px 64px 50px; }}
.bn {{ font-family:{BN_FONT}; }}
.top {{ display:flex; justify-content:space-between; align-items:center; }}
.brand {{ display:flex; gap:10px; align-items:center; font-weight:700;
          letter-spacing:4px; font-size:19px; }}
.dot {{ width:13px; height:13px; border-radius:50%; background:{ORANGE}; }}
.mon {{ text-align:right; }}
.mon .bn {{ font-size:26px; font-weight:600; }}
.mon small {{ font-size:13px; color:{FAINT}; letter-spacing:2px; }}
.head {{ margin-top:44px; }}
.head .bn {{ font-size:44px; font-weight:700; line-height:1.25; }}
.head .en {{ font-size:17px; color:{MUTED}; margin-top:8px; }}
.heroRow {{ display:flex; align-items:flex-end; gap:36px; margin-top:34px; }}
.heroNum {{ font-size:150px; font-weight:700; color:{ORANGE};
            letter-spacing:-5px; line-height:0.95; }}
.heroSide {{ padding-bottom:16px; }}
.heroSide .bn {{ font-size:23px; font-weight:600; }}
.heroSide .en {{ font-size:14px; color:{MUTED}; margin-top:3px; }}
.note {{ font-size:14px; color:{MUTED}; margin-top:14px; }}
.chips {{ display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-top:36px; }}
.chip {{ background:{SOFT}; border-radius:16px; padding:18px 22px;
         display:flex; align-items:center; gap:16px; }}
.chip b {{ font-size:38px; letter-spacing:-1px; min-width:96px; }}
.chip .bn {{ font-size:17px; font-weight:600; display:block; }}
.chip .en {{ font-size:11.5px; color:{MUTED}; display:block; }}
.story {{ margin-top:38px; flex:1; }}
.story h3 .bn {{ font-size:21px; font-weight:700; }}
.story h3 .en {{ font-size:12px; color:{ORANGE_DEEP}; letter-spacing:2.4px;
                 text-transform:uppercase; margin-left:10px; }}
.br {{ display:flex; align-items:center; gap:16px; padding:8.5px 0;
       border-bottom:1px solid {LINE}; }}
.brl {{ width:330px; font-size:16.5px; }}
.brl .en {{ display:block; font-size:11px; color:{FAINT}; }}
.brt {{ flex:1; height:14px; background:{SOFT}; border-radius:7px; overflow:hidden; }}
.brt i {{ display:block; height:100%; border-radius:7px;
          background:linear-gradient(90deg,{ORANGE},{ORANGE_DEEP}); }}
.brv {{ width:84px; text-align:right; font-size:20px; font-weight:700; }}
.cov {{ margin-top:16px; font-size:14px; color:{MUTED}; }}
.foot {{ display:flex; justify-content:space-between; align-items:center;
         border-top:2px solid {INK}; padding-top:18px; margin-top:26px; }}
.foot .l {{ font-size:12.5px; color:{MUTED}; }}
.foot .r {{ font-size:12.5px; color:{FAINT}; }}
"""


def build_poster_html(c: dict) -> str:
    hero = c['hero']
    pts = spark_path(c['trend'], w=250, h=70)
    spark = (f'<svg width="250" height="70"><polyline points="{pts}" fill="none" '
             f'stroke="{ORANGE}" stroke-width="4" stroke-linejoin="round" '
             f'opacity="0.85"/></svg>') if pts else ''
    chips = ''.join(
        f'<div class="chip"><b>{fmt(k["value"])}</b>'
        f'<span><span style="font-size:16px;font-weight:600;display:block">{esc(k["en"])}</span></span></div>'
        for k in c['kpis'][:4])

    block = (c['blocks'][0] if c['blocks'] else None)
    story = ''
    if block:
        rows = block['rows'][:6]
        top = max((r['value'] for r in rows), default=0) or 1
        brs = ''.join(
            f'<div class="br"><span class="brl"><span style="font-size:16px">{esc(r["en"])}</span></span>'
            f'<span class="brt"><i style="width:{round(r["value"]/top*100,1)}%"></i></span>'
            f'<span class="brv">{fmt(r["value"])}</span></div>'
            for r in rows)
        story = (f'<div class="story"><h3><span style="font-size:21px;font-weight:700">'
                 f'{esc(block["en"])}</span></h3>{brs}</div>')
    elif c.get('partners'):
        brs = []
        for p in c['partners']:
            d = p['data']
            top = max(x['data']['hero']['value'] for x in c['partners']) or 1
            w = round(d['hero']['value'] / top * 100, 1)
            brs.append(
                f'<div class="br"><span class="brl"><span style="font-size:16px;font-weight:600">'
                f'{esc(d["org_label"])}</span></span>'
                f'<span class="brt"><i style="width:{w}%;background:{p["accent"]}"></i></span>'
                f'<span class="brv">{fmt(d["hero"]["value"])}</span></div>')
        story = (f'<div class="story"><h3><span style="font-size:21px;font-weight:700">'
                 f'By partner</span></h3>{"".join(brs)}</div>')

    cov = (f'<div class="cov">{esc(c["geo"]["coverage"])}</div>'
           if c['geo'].get('coverage') else '')

    return f"""<!doctype html><html><head><meta charset="utf-8">{FONT_LINK}
<style>{_CSS}</style></head><body>
<div class="poster">
  <div class="top">
    <div class="brand"><span class="dot"></span>SIMPLE</div>
    <div class="mon"><div style="font-size:26px;font-weight:600">{esc(c['period_label'])}</div>
      <small>{esc(c['org'] or 'ALL PARTNERS')}</small></div>
  </div>
  <div class="head">
    <div style="font-size:40px;font-weight:700;line-height:1.25">{esc(hero['en'])}</div>
  </div>
  <div class="heroRow">
    <div class="heroNum">{fmt(hero['value'])}</div>
    <div class="heroSide">{spark}
      <div class="en" style="color:{FAINT};font-size:12px">12-month trend</div>
    </div>
  </div>
  <div class="note">{esc(hero['note'])}</div>
  <div class="chips">{chips}</div>
  {story}{cov}
  <div class="foot">
    <span class="l">SIMPLE — Integrated Digital M&amp;E System</span>
    <span class="r">CIPRB · UNFPA BANGLADESH</span>
  </div>
</div></body></html>"""


def render_poster_png(content: dict, browser=None) -> bytes:
    from .html_render import html_to_png
    return html_to_png(build_poster_html(content), selector='.poster',
                       scale=2, browser=browser)
