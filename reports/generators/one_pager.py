"""One-pager PDF: compact A4 summary with KPI boxes."""
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet


def build_one_pager(title: str, kpis: list[dict], narrative: str = '') -> bytes:
    """
    Build a compact one-pager PDF with KPI boxes.

    Args:
        title: Report title.
        kpis: List of {'label': str, 'value': str/int} dicts.
        narrative: Short narrative text.

    Returns:
        PDF bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=1.5*cm, rightMargin=1.5*cm,
                            topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    story = [Paragraph(title, styles['Title']), Spacer(1, 0.4*cm)]

    if kpis:
        # Arrange KPIs in rows of 3
        chunk_size = 3
        for i in range(0, len(kpis), chunk_size):
            chunk = kpis[i:i + chunk_size]
            labels = [Paragraph(f'<b>{k["label"]}</b>', styles['Normal']) for k in chunk]
            values = [Paragraph(f'<font size=20><b>{k["value"]}</b></font>', styles['Normal'])
                      for k in chunk]
            # Pad to 3 if shorter
            while len(labels) < chunk_size:
                labels.append(Paragraph('', styles['Normal']))
                values.append(Paragraph('', styles['Normal']))
            t = Table([labels, values], colWidths=[5.5*cm] * chunk_size)
            t.setStyle(TableStyle([
                ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#2563EB')),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#BFDBFE')),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EFF6FF')),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(t)
            story.append(Spacer(1, 0.3*cm))

    if narrative:
        story.append(Paragraph(narrative[:600], styles['BodyText']))

    doc.build(story)
    return buffer.getvalue()
