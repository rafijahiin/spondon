"""Monthly newsletter PDF generator."""
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable


def build_newsletter(title: str, sections: list[dict]) -> bytes:
    """
    Build a formatted newsletter PDF.

    Args:
        title: Newsletter title (e.g. 'Spondon Monthly — May 2025').
        sections: List of {'heading': str, 'body': str} dicts.

    Returns:
        PDF bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    accent_style = ParagraphStyle(
        'AccentHeading',
        parent=styles['Heading2'],
        textColor=colors.HexColor('#1D4ED8'),
        spaceAfter=4,
    )
    story = [
        Paragraph(title, styles['Title']),
        HRFlowable(width='100%', thickness=2, color=colors.HexColor('#2563EB')),
        Spacer(1, 0.4*cm),
    ]

    for section in sections:
        story.append(Paragraph(section.get('heading', ''), accent_style))
        body = section.get('body', '')
        for para in body.split('\n\n'):
            if para.strip():
                story.append(Paragraph(para.strip(), styles['BodyText']))
                story.append(Spacer(1, 0.2*cm))
        story.append(Spacer(1, 0.3*cm))

    doc.build(story)
    return buffer.getvalue()
