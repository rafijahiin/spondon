"""
UNFPA-branded 6-slide PowerPoint presentation generator.

Slides:
  1. Title slide (dark navy, white text)
  2. Executive Summary (AI narrative, 3 bullets)
  3. Programme Performance (bar chart)
  4. Activity Summary (data table, colour-coded)
  5. Achievements & Forward Look (AI narrative)
  6. Closing slide (navy, contact)
"""
from __future__ import annotations

import io
from datetime import date as _date

from pptx import Presentation
from pptx.chart.data import ChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt, Emu

# ── Brand colours ──────────────────────────────────────────────────────────────
NAVY  = RGBColor(0x00, 0x3F, 0x72)
BLUE  = RGBColor(0x00, 0x93, 0xD0)
DARK  = RGBColor(0x17, 0x2B, 0x4D)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GREY  = RGBColor(0x6B, 0x77, 0x8C)
LGREY = RGBColor(0xDF, 0xE1, 0xE6)
GREEN = RGBColor(0x00, 0x87, 0x5A)
AMBER = RGBColor(0xFF, 0x99, 0x1F)
RED   = RGBColor(0xDE, 0x35, 0x0B)
# ──────────────────────────────────────────────────────────────────────────────

SLIDE_W = Inches(13.33)
SLIDE_H = Inches(7.5)


def _rgb_to_tuple(rgb: RGBColor) -> tuple[int, int, int]:
    return (rgb.red, rgb.green, rgb.blue)


def _solid_fill(shape, rgb: RGBColor):
    shape.fill.solid()
    shape.fill.fore_color.rgb = rgb


def _set_text_color(run, rgb: RGBColor):
    run.font.color.rgb = rgb


def _set_cell_bg(cell, rgb: RGBColor):
    cell.fill.solid()
    cell.fill.fore_color.rgb = rgb


def _add_textbox(slide, left, top, width, height, text, bold=False, size=18,
                 color=WHITE, align=PP_ALIGN.LEFT, wrap=True):
    txb = slide.shapes.add_textbox(left, top, width, height)
    tf  = txb.text_frame
    tf.word_wrap = wrap
    p   = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.bold  = bold
    run.font.size  = Pt(size)
    run.font.color.rgb = color
    return txb


def _full_rect(slide, color: RGBColor):
    """Solid colour rectangle covering the entire slide."""
    shp = slide.shapes.add_shape(
        1,  # MSO_SHAPE_TYPE.RECTANGLE
        0, 0, SLIDE_W, SLIDE_H,
    )
    _solid_fill(shp, color)
    shp.line.fill.background()   # no border


def _header_bar(slide, title: str, subtitle: str = ''):
    """Navy header bar at top of content slides."""
    bar_h = Inches(0.9)
    bar = slide.shapes.add_shape(1, 0, 0, SLIDE_W, bar_h)
    _solid_fill(bar, NAVY)
    bar.line.fill.background()

    _add_textbox(slide, Inches(0.4), Inches(0.1), Inches(12.5), Inches(0.45),
                 title, bold=True, size=22, color=WHITE)
    if subtitle:
        _add_textbox(slide, Inches(0.4), Inches(0.52), Inches(12.5), Inches(0.3),
                     subtitle, size=10, color=RGBColor(0x9B, 0xB5, 0xD0))


def _footer_bar(slide, period_label: str):
    """Thin dark footer at bottom of content slides."""
    bar_h = Inches(0.35)
    bar = slide.shapes.add_shape(1, 0, SLIDE_H - bar_h, SLIDE_W, bar_h)
    _solid_fill(bar, DARK)
    bar.line.fill.background()

    today = f"{_date.today().day} {_date.today().strftime('%b %Y')}"
    _add_textbox(
        slide, Inches(0.3), SLIDE_H - bar_h + Inches(0.04),
        Inches(8), Inches(0.28),
        f'CIPRB / UNFPA Bangladesh · Spondon IDMS · {period_label}',
        size=7, color=RGBColor(0x9B, 0xB5, 0xD0),
    )
    _add_textbox(
        slide, Inches(10), SLIDE_H - bar_h + Inches(0.04),
        Inches(3), Inches(0.28),
        f'Generated: {today}',
        size=7, color=RGBColor(0x9B, 0xB5, 0xD0), align=PP_ALIGN.RIGHT,
    )


def _slide1_title(prs, data: dict) -> None:
    """Slide 1: Dark navy title slide."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank

    _full_rect(slide, NAVY)

    # Accent stripe
    stripe = slide.shapes.add_shape(1, 0, Inches(5.2), SLIDE_W, Inches(0.08))
    _solid_fill(stripe, BLUE)
    stripe.line.fill.background()

    _add_textbox(slide, Inches(1), Inches(1.2), Inches(11), Inches(1.2),
                 'PROGRAMME ACTIVITY REPORT', bold=True, size=36, color=WHITE)

    _add_textbox(slide, Inches(1), Inches(2.6), Inches(11), Inches(0.6),
                 'Spondon Integrated Data Management System', size=16,
                 color=RGBColor(0x9B, 0xB5, 0xD0))

    _add_textbox(slide, Inches(1), Inches(3.3), Inches(11), Inches(0.5),
                 data.get('organisation', 'All Partners'), size=14,
                 color=RGBColor(0xDD, 0xF0, 0xFA))

    _add_textbox(slide, Inches(1), Inches(3.9), Inches(11), Inches(0.5),
                 data.get('period_label', ''), size=13,
                 color=RGBColor(0xDD, 0xF0, 0xFA))

    # Bottom branding
    _add_textbox(slide, Inches(1), Inches(6.3), Inches(11), Inches(0.4),
                 'CIPRB — Centre for Injury Prevention and Research, Bangladesh  |  In partnership with UNFPA Bangladesh',
                 size=8, color=RGBColor(0x6B, 0x77, 0x8C))


def _slide2_exec_summary(prs, data: dict, narrative_sections: dict) -> None:
    """Slide 2: Executive Summary."""
    slide  = prs.slides.add_slide(prs.slide_layouts[6])
    period = data.get('period_label', '')

    _header_bar(slide, 'Executive Summary', period)
    _footer_bar(slide, period)

    exec_text = narrative_sections.get('EXECUTIVE SUMMARY', '')
    if not exec_text:
        exec_text = (
            f"During {period}, the programme recorded "
            f"{data.get('total_submissions', 0)} approved activities across all service "
            "centres. Key areas include clinical services, outreach, and community education."
        )

    # Body text
    y = Inches(1.1)
    _add_textbox(slide, Inches(0.5), y, Inches(12.3), Inches(5.5),
                 exec_text, size=13, color=DARK, wrap=True)

    # Summary stats in bottom-right corner boxes
    kpis = data.get('top_kpis', [])[:4]
    box_w = Inches(2.8)
    box_h = Inches(1.1)
    accent_colors = [BLUE, GREEN, AMBER, RED]
    for i, kpi in enumerate(kpis):
        bx = Inches(0.4) + i * (box_w + Inches(0.2))
        by = Inches(5.8)
        shp = slide.shapes.add_shape(1, bx, by, box_w, box_h)
        _solid_fill(shp, accent_colors[i])
        shp.line.fill.background()
        _add_textbox(slide, bx, by + Inches(0.05), box_w, Inches(0.6),
                     str(kpi['value']), bold=True, size=26, color=WHITE, align=PP_ALIGN.CENTER)
        _add_textbox(slide, bx, by + Inches(0.65), box_w, Inches(0.38),
                     kpi['label'], size=8, color=WHITE, align=PP_ALIGN.CENTER)


def _slide3_performance(prs, data: dict) -> None:
    """Slide 3: Programme Performance bar chart."""
    slide  = prs.slides.add_slide(prs.slide_layouts[6])
    period = data.get('period_label', '')

    _header_bar(slide, 'Programme Performance', f'Submissions by Activity Type · {period}')
    _footer_bar(slide, period)

    chart_items = data.get('chart_data', [])
    if not chart_items:
        _add_textbox(slide, Inches(1), Inches(3), Inches(11), Inches(1),
                     'No approved submissions for this period.', size=14, color=GREY,
                     align=PP_ALIGN.CENTER)
        return

    # Sort descending for PPTX bar chart
    sorted_items = sorted(chart_items, key=lambda x: x[1], reverse=True)
    labels = [item[0] for item in sorted_items]
    values = [item[1] for item in sorted_items]

    cd = ChartData()
    cd.categories = labels
    cd.add_series('Activities', values)

    chart_placeholder = slide.shapes.add_chart(
        XL_CHART_TYPE.BAR_CLUSTERED,
        Inches(0.4), Inches(1.0),
        Inches(12.5), Inches(5.7),
        cd,
    )
    chart = chart_placeholder.chart

    # Style the chart
    plot  = chart.plots[0]
    series = plot.series[0]
    series.format.fill.solid()
    series.format.fill.fore_color.rgb = BLUE

    chart.has_legend = False
    chart.has_title  = False

    val_axis  = chart.value_axis
    cat_axis  = chart.category_axis

    val_axis.has_major_gridlines = True
    val_axis.major_gridlines.format.line.color.rgb = LGREY

    cat_axis.tick_labels.font.size = Pt(9)
    val_axis.tick_labels.font.size = Pt(9)


def _slide4_indicators(prs, data: dict) -> None:
    """Slide 4: Activity Summary table."""
    slide  = prs.slides.add_slide(prs.slide_layouts[6])
    period = data.get('period_label', '')

    _header_bar(slide, 'Activity Summary', period)
    _footer_bar(slide, period)

    counts = data.get('counts', {})
    rows = [
        ('Activity Type',             'Count',  True),
        ('Clinic Visits',              counts.get('clinic_visits', 0), False),
        ('HIV/STI Tests',              counts.get('hiv_sti_tests', 0), False),
        ('Antenatal Cards',            counts.get('antenatal_cards', 0), False),
        ('HTC Counselling',            counts.get('htc_counselling', 0), False),
        ('Individual Counselling',     counts.get('individual_counselling', 0), False),
        ('MH Screenings',              counts.get('mh_screenings', 0), False),
        ('GBV Cases',                  counts.get('gbv_cases', 0), False),
        ('Outreach Sessions',          counts.get('outreach_sessions', 0), False),
        ('Group Education',            counts.get('group_education', 0), False),
        ('Referrals',                  counts.get('referrals', 0), False),
        ('Hygiene Kits',               counts.get('hygiene_kits', 0), False),
        ('Training Events',            counts.get('training_events', 0), False),
        ('Mobile Health Camps',        counts.get('mobile_camps', 0), False),
        ('Coord. Meetings',            counts.get('coord_meetings', 0), False),
    ]

    n_rows = len(rows)
    n_cols = 2
    tbl = slide.shapes.add_table(
        n_rows, n_cols,
        Inches(0.5), Inches(1.05),
        Inches(12.3), Inches(5.9),
    ).table

    tbl.columns[0].width = Inches(9.0)
    tbl.columns[1].width = Inches(3.3)

    for r_idx, (label, value, is_header) in enumerate(rows):
        cell0 = tbl.cell(r_idx, 0)
        cell1 = tbl.cell(r_idx, 1)

        cell0.text = str(label)
        cell1.text = str(value)

        for c_idx, cell in enumerate([cell0, cell1]):
            tf   = cell.text_frame
            para = tf.paragraphs[0]
            para.alignment = PP_ALIGN.LEFT if c_idx == 0 else PP_ALIGN.CENTER
            run  = para.runs[0] if para.runs else para.add_run()
            run.font.size  = Pt(9.5 if is_header else 9)
            run.font.bold  = is_header

            if is_header:
                _set_cell_bg(cell, NAVY)
                run.font.color.rgb = WHITE
            elif r_idx % 2 == 0:
                _set_cell_bg(cell, RGBColor(0xF0, 0xF8, 0xFF))
                run.font.color.rgb = DARK
            else:
                _set_cell_bg(cell, RGBColor(0xFF, 0xFF, 0xFF))
                run.font.color.rgb = DARK

            # Highlight high GBV count in red
            if label == 'GBV Cases' and isinstance(value, int) and value > 0:
                run.font.color.rgb = RED


def _slide5_highlights(prs, data: dict, narrative_sections: dict) -> None:
    """Slide 5: Achievements & Forward Look."""
    slide  = prs.slides.add_slide(prs.slide_layouts[6])
    period = data.get('period_label', '')

    _header_bar(slide, 'Achievements & Forward Look', period)
    _footer_bar(slide, period)

    # Left column: highlights bullets
    highlights_raw = narrative_sections.get('PROGRAMME HIGHLIGHTS', '')
    forward_raw    = narrative_sections.get('FORWARD LOOK', '')

    col_w = Inches(5.9)
    col_h = Inches(5.4)
    gap   = Inches(0.4)
    left1 = Inches(0.4)
    left2 = left1 + col_w + gap

    # LEFT — Highlights
    shp1 = slide.shapes.add_shape(1, left1, Inches(1.05), col_w, col_h)
    _solid_fill(shp1, RGBColor(0xDD, 0xF0, 0xFA))
    shp1.line.fill.background()

    _add_textbox(slide, left1 + Inches(0.15), Inches(1.15), col_w - Inches(0.3), Inches(0.4),
                 'PROGRAMME HIGHLIGHTS', bold=True, size=11, color=NAVY)

    if highlights_raw:
        lines = [l.strip().lstrip('•-*· ') for l in highlights_raw.splitlines() if l.strip()]
    else:
        counts = data.get('counts', {})
        lines = [
            f"Clinic visits conducted: {counts.get('clinic_visits', 0)}",
            f"Outreach sessions delivered: {counts.get('outreach_sessions', 0)}",
            f"Group education sessions: {counts.get('group_education', 0)}",
            f"GBV cases reported and supported: {counts.get('gbv_cases', 0)}",
            f"Referrals completed: {counts.get('referrals', 0)}",
        ]

    y_off = Inches(1.65)
    for line in lines[:7]:
        _add_textbox(slide, left1 + Inches(0.2), y_off, col_w - Inches(0.4), Inches(0.55),
                     f'• {line}', size=10, color=DARK)
        y_off += Inches(0.52)

    # RIGHT — Forward Look
    shp2 = slide.shapes.add_shape(1, left2, Inches(1.05), col_w, col_h)
    _solid_fill(shp2, RGBColor(0xF0, 0xF8, 0xFF))
    shp2.line.fill.background()

    _add_textbox(slide, left2 + Inches(0.15), Inches(1.15), col_w - Inches(0.3), Inches(0.4),
                 'FORWARD LOOK', bold=True, size=11, color=NAVY)

    if not forward_raw:
        forward_raw = (
            "The programme will continue to expand service delivery across all centres "
            "in the coming period. Field teams are targeting increased outreach coverage "
            "and timely case follow-up. All partners are requested to ensure data submissions "
            "are completed within 48 hours of activity completion."
        )
    _add_textbox(slide, left2 + Inches(0.15), Inches(1.65), col_w - Inches(0.3), Inches(4.5),
                 forward_raw, size=10, color=DARK, wrap=True)


def _slide6_closing(prs, data: dict) -> None:
    """Slide 6: Dark closing slide."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _full_rect(slide, NAVY)

    stripe = slide.shapes.add_shape(1, 0, Inches(3.8), SLIDE_W, Inches(0.08))
    _solid_fill(stripe, BLUE)
    stripe.line.fill.background()

    _add_textbox(slide, Inches(1.5), Inches(1.5), Inches(10), Inches(1.2),
                 'For further information', bold=True, size=28, color=WHITE, align=PP_ALIGN.CENTER)
    _add_textbox(slide, Inches(1.5), Inches(2.8), Inches(10), Inches(0.6),
                 'CIPRB — Centre for Injury Prevention and Research, Bangladesh',
                 size=14, color=RGBColor(0xDD, 0xF0, 0xFA), align=PP_ALIGN.CENTER)
    _add_textbox(slide, Inches(1.5), Inches(3.5), Inches(10), Inches(0.5),
                 'In partnership with UNFPA Bangladesh', size=12,
                 color=RGBColor(0x9B, 0xB5, 0xD0), align=PP_ALIGN.CENTER)
    _add_textbox(slide, Inches(1.5), Inches(4.2), Inches(10), Inches(0.5),
                 'spondon.app', size=13, color=BLUE, align=PP_ALIGN.CENTER)

    today = f"{_date.today().day} {_date.today().strftime('%b %Y')}"
    _add_textbox(slide, Inches(1.5), Inches(6.5), Inches(10), Inches(0.4),
                 f'AI-assisted content — reviewed before distribution · Generated {today}',
                 size=7, color=RGBColor(0x6B, 0x77, 0x8C), align=PP_ALIGN.CENTER)


def _parse_sections(narrative: str) -> dict[str, str]:
    """Same section parser as in newsletter.py."""
    known = ['EXECUTIVE SUMMARY', 'PROGRAMME HIGHLIGHTS', 'NARRATIVE', 'FORWARD LOOK']
    sections: dict[str, str] = {}
    current_key = '_intro'
    current_lines: list[str] = []
    for line in narrative.splitlines():
        stripped = line.strip().upper()
        matched = next((k for k in known if stripped == k), None)
        if matched:
            sections[current_key] = '\n'.join(current_lines).strip()
            current_key = matched
            current_lines = []
        else:
            current_lines.append(line)
    sections[current_key] = '\n'.join(current_lines).strip()
    return sections


def build_presentation(data: dict, narrative: str = '') -> bytes:
    """
    Build the UNFPA-branded 6-slide PPTX.

    Args:
        data:      Dict from collect_programme_data()
        narrative: Groq newsletter narrative with section headings.

    Returns:
        PPTX bytes.
    """
    prs = Presentation()
    prs.slide_width  = SLIDE_W
    prs.slide_height = SLIDE_H

    sections = _parse_sections(narrative) if narrative else {}

    _slide1_title(prs, data)
    _slide2_exec_summary(prs, data, sections)
    _slide3_performance(prs, data)
    _slide4_indicators(prs, data)
    _slide5_highlights(prs, data, sections)
    _slide6_closing(prs, data)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# ── Backward-compat wrapper ───────────────────────────────────────────────────
def build_summary_pptx(title: str, rows: list[tuple], narrative: str = '') -> bytes:
    """Legacy wrapper: called from old views.py path."""
    counts = {r[0].lower().replace(' ', '_'): r[1] for r in rows if isinstance(r[1], int)}
    data = {
        'period_label':      title,
        'organisation':      'All Partners',
        'total_submissions': sum(v for v in counts.values()),
        'counts':            counts,
        'top_kpis': [
            {'label': r[0], 'value': r[1]} for r in rows[:4] if isinstance(r[1], int)
        ],
        'chart_data': [(r[0], r[1]) for r in rows if isinstance(r[1], int)],
    }
    return build_presentation(data, narrative)
