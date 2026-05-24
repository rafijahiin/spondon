"""
Beautiful A4 infographic PDF generator.

Layout (top to bottom):
  - Navy header bar (programme title + period + org)
  - Blue subtitle band ("PROGRAMME ACTIVITY REPORT")
  - 4 KPI tiles (big numbers, coloured top accent)
  - Horizontal bar chart (Submissions by Activity Type)
  - Highlighted AI bullet panel
  - Dark footer (CIPRB | UNFPA | date | AI disclaimer)
"""
from __future__ import annotations

import io
import textwrap
from datetime import date as _date
from typing import Any

from reportlab.graphics import renderPDF
from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as _canvas

# ── Brand palette ──────────────────────────────────────────────────────────────
NAVY        = HexColor('#003F72')
BLUE        = HexColor('#0093D0')
LIGHT_BLUE  = HexColor('#DDF0FA')
DARK        = HexColor('#172B4D')
GREY        = HexColor('#6B778C')
LIGHT_GREY  = HexColor('#F4F5F7')
MID_GREY    = HexColor('#DFE1E6')
GREEN       = HexColor('#00875A')
AMBER       = HexColor('#FF991F')
RED         = HexColor('#DE350B')
MUTED_BLUE  = HexColor('#9BB5D0')
# ──────────────────────────────────────────────────────────────────────────────

W, H    = A4           # 595.27 × 841.89 pt
MARGIN  = 36           # 0.5 in left/right margin
CW      = W - 2*MARGIN # content width  (~523 pt)


def _date_str(d: _date) -> str:
    return f"{d.day} {d.strftime('%b %Y')}"


def _draw_rounded_rect(c, x, y, w, h, r, fill_color, stroke_color=None):
    """Helper: draw a filled rounded rectangle."""
    c.setFillColor(fill_color)
    if stroke_color:
        c.setStrokeColor(stroke_color)
        c.roundRect(x, y, w, h, r, fill=1, stroke=1)
    else:
        c.setStrokeColor(fill_color)
        c.roundRect(x, y, w, h, r, fill=1, stroke=0)


def _draw_kpi_tile(c, x, y, tile_w, tile_h, value: Any, label: str, accent_color):
    """Draw a single KPI tile: white box, coloured top accent, big number, label."""
    # Shadow / border
    c.setFillColor(MID_GREY)
    c.roundRect(x + 2, y - 2, tile_w, tile_h, 7, fill=1, stroke=0)

    # White tile
    _draw_rounded_rect(c, x, y, tile_w, tile_h, 7, white, MID_GREY)

    # Top accent stripe
    c.setFillColor(accent_color)
    c.rect(x, y + tile_h - 6, tile_w, 6, fill=1, stroke=0)
    # Clip rounded corners on the accent — just cut it for simplicity
    c.roundRect(x, y + tile_h - 6, tile_w, 6, 7, fill=1, stroke=0)

    # Big number
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 26)
    c.drawCentredString(x + tile_w / 2, y + tile_h / 2 + 4, str(value))

    # Label
    c.setFillColor(GREY)
    c.setFont('Helvetica', 8)
    c.drawCentredString(x + tile_w / 2, y + 12, label)


def _build_bar_chart(chart_data: list[tuple], width: float, height: float) -> Drawing:
    """Build a ReportLab horizontal bar chart Drawing."""
    d = Drawing(width, height)

    labels = [item[0] for item in chart_data]
    values = [item[1] for item in chart_data]

    # Background
    bg = Rect(0, 0, width, height, fillColor=white, strokeColor=None)
    d.add(bg)

    bc = HorizontalBarChart()
    bc.x           = 130        # space for category labels on the left
    bc.y           = 10
    bc.height      = height - 20
    bc.width       = width - 145
    bc.data        = [values]
    bc.reversePlotOrder = 0

    bc.categoryAxis.categoryNames    = labels
    bc.categoryAxis.labels.fontSize  = 7.5
    bc.categoryAxis.labels.fontName  = 'Helvetica'
    bc.categoryAxis.labels.dx        = -6
    bc.categoryAxis.labels.textAnchor = 'end'
    bc.categoryAxis.tickLeft         = 0
    bc.categoryAxis.strokeWidth      = 0

    bc.valueAxis.labels.fontSize    = 7
    bc.valueAxis.labels.fontName    = 'Helvetica'
    bc.valueAxis.forceZero          = 1
    bc.valueAxis.strokeWidth        = 0.5
    bc.valueAxis.strokeColor        = MID_GREY
    bc.valueAxis.gridStrokeColor    = LIGHT_GREY
    bc.valueAxis.gridStrokeDashArray = [2, 2]

    bc.bars[0].fillColor    = BLUE
    bc.bars[0].strokeColor  = None
    bc.bars.strokeColor     = None
    bc.barSpacing           = 2
    bc.groupSpacing         = 4

    d.add(bc)
    return d


def build_infographic(data: dict, narrative: str = '') -> bytes:
    """
    Build the UNFPA-branded A4 infographic PDF.

    Args:
        data:      Dict from reports.generators.data.collect_programme_data()
        narrative: Optional AI-generated narrative (used for bullet points)

    Returns:
        PDF bytes
    """
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)

    # ── HEADER BAR ──────────────────────────────────────────────────────────────
    header_h = 68
    c.setFillColor(NAVY)
    c.rect(0, H - header_h, W, header_h, fill=1, stroke=0)

    # Left: branding
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 17)
    c.drawString(MARGIN, H - 34, 'Spondon IDMS')
    c.setFont('Helvetica', 8.5)
    c.setFillColor(MUTED_BLUE)
    c.drawString(MARGIN, H - 50, 'Integrated Data Management System · CIPRB / UNFPA Bangladesh')

    # Right: period + org
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 11)
    c.drawRightString(W - MARGIN, H - 34, data.get('period_label', ''))
    c.setFont('Helvetica', 9)
    c.setFillColor(MUTED_BLUE)
    c.drawRightString(W - MARGIN, H - 50, data.get('organisation', 'All Partners'))

    # ── SUBTITLE BAND ────────────────────────────────────────────────────────────
    subtitle_h = 22
    subtitle_y = H - header_h - subtitle_h
    c.setFillColor(BLUE)
    c.rect(0, subtitle_y, W, subtitle_h, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 10)
    c.drawCentredString(W / 2, subtitle_y + 7, 'PROGRAMME ACTIVITY REPORT')

    # ── KPI TILES ────────────────────────────────────────────────────────────────
    kpis       = data.get('top_kpis', [])[:4]
    tile_gap   = 10
    tile_h     = 84
    tile_w     = (CW - tile_gap * 3) / 4
    tile_top_y = subtitle_y - 16 - tile_h
    accent_colors = [BLUE, GREEN, AMBER, RED]

    for i, kpi in enumerate(kpis):
        tx = MARGIN + i * (tile_w + tile_gap)
        _draw_kpi_tile(
            c, tx, tile_top_y, tile_w, tile_h,
            kpi['value'], kpi['label'],
            accent_colors[i % len(accent_colors)],
        )

    # ── CHART SECTION ────────────────────────────────────────────────────────────
    chart_heading_y = tile_top_y - 28
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(MARGIN, chart_heading_y, 'Submissions by Activity Type')

    # Thin rule under heading
    c.setStrokeColor(LIGHT_BLUE)
    c.setLineWidth(1)
    c.line(MARGIN, chart_heading_y - 4, W - MARGIN, chart_heading_y - 4)

    chart_h = 210
    chart_bottom_y = chart_heading_y - 14 - chart_h
    chart_data = data.get('chart_data', [])

    if chart_data:
        d = _build_bar_chart(chart_data, CW, chart_h)
        renderPDF.draw(d, c, MARGIN, chart_bottom_y)
    else:
        # Placeholder text when no data
        c.setFillColor(GREY)
        c.setFont('Helvetica', 10)
        c.drawCentredString(W / 2, chart_bottom_y + chart_h / 2, 'No approved submissions recorded for this period.')

    # ── AI HIGHLIGHTS PANEL ──────────────────────────────────────────────────────
    panel_gap     = 14
    panel_top_y   = chart_bottom_y - panel_gap
    panel_h       = 132
    panel_bottom_y = panel_top_y - panel_h

    _draw_rounded_rect(c, MARGIN, panel_bottom_y, CW, panel_h, 8, LIGHT_BLUE)

    # Panel heading
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(MARGIN + 12, panel_top_y - 18, 'Programme Highlights')

    # Bullet points: extract from narrative or build from data
    if narrative:
        raw = narrative.replace('\n\n', '\n').replace('\r', '')
        sentences = [s.strip().lstrip('•-* ') for s in raw.split('\n') if s.strip()]
        bullets = [s for s in sentences if len(s) > 20][:4]
    else:
        counts = data.get('counts', {})
        bullets = [
            f"Total of {data.get('total_submissions', 0)} programme activities recorded this period.",
            f"Clinic visits: {counts.get('clinic_visits', 0)}  |  HIV/STI tests: {counts.get('hiv_sti_tests', 0)}",
            f"Outreach sessions: {counts.get('outreach_sessions', 0)}  |  Group education: {counts.get('group_education', 0)}",
            f"GBV cases reported: {counts.get('gbv_cases', 0)}  |  Referrals made: {counts.get('referrals', 0)}",
        ]

    c.setFillColor(DARK)
    c.setFont('Helvetica', 8.5)
    bullet_y = panel_top_y - 36
    for bullet in bullets[:4]:
        wrapped = textwrap.fill(bullet, width=88)
        lines = wrapped.split('\n')
        c.drawString(MARGIN + 12, bullet_y, f'•  {lines[0]}')
        for extra_line in lines[1:]:
            bullet_y -= 14
            c.drawString(MARGIN + 21, bullet_y, extra_line)
        bullet_y -= 20

    # ── FOOTER BAR ───────────────────────────────────────────────────────────────
    footer_h = 48
    c.setFillColor(DARK)
    c.rect(0, 0, W, footer_h, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 8)
    c.drawString(MARGIN, 32, 'CIPRB — Centre for Injury Prevention and Research, Bangladesh')
    c.setFont('Helvetica', 8)
    c.drawString(MARGIN, 18, 'In partnership with UNFPA Bangladesh | spondon.app')

    today_str = _date_str(_date.today())
    c.setFont('Helvetica', 7.5)
    c.setFillColor(white)
    c.drawRightString(W - MARGIN, 32, f'Generated: {today_str}')
    c.setFillColor(MUTED_BLUE)
    c.drawRightString(W - MARGIN, 18, 'AI-assisted content — reviewed before distribution')

    c.save()
    return buf.getvalue()


# ── Backward-compat wrapper (called from old views) ───────────────────────────
def build_one_pager(title: str, kpis: list[dict], narrative: str = '') -> bytes:
    """Legacy wrapper: convert old-style kpi list to infographic data dict."""
    data = {
        'period_label':      title,
        'organisation':      'All Partners',
        'total_submissions': next((k['value'] for k in kpis if 'Total' in k['label']), 0),
        'counts':            {},
        'top_kpis':          kpis[:4],
        'chart_data':        [(k['label'], k['value']) for k in kpis if isinstance(k['value'], int)],
    }
    return build_infographic(data, narrative)
