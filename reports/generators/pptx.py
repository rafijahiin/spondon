"""
PowerPoint summary slide generator using python-pptx.
"""
import io

from pptx import Presentation
from pptx.util import Inches, Pt


def build_summary_pptx(title: str, rows: list[tuple], narrative: str = '') -> bytes:
    """
    Build a simple 2-slide PowerPoint deck: title slide + data table slide.

    Returns:
        PPTX file content as bytes.
    """
    prs = Presentation()

    # Slide 1: Title
    title_slide_layout = prs.slide_layouts[0]
    slide = prs.slides.add_slide(title_slide_layout)
    slide.shapes.title.text = title
    slide.placeholders[1].text = 'Programme Summary Report'

    # Slide 2: Table
    if rows:
        blank_layout = prs.slide_layouts[5]
        slide2 = prs.slides.add_slide(blank_layout)
        txBox = slide2.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.6))
        txBox.text_frame.text = 'Key Indicators'
        txBox.text_frame.paragraphs[0].font.size = Pt(24)
        txBox.text_frame.paragraphs[0].font.bold = True

        cols = 2
        table_rows = len(rows) + 1
        left, top = Inches(0.5), Inches(1.0)
        width, height = Inches(9), Inches(0.4 * table_rows)
        tbl = slide2.shapes.add_table(table_rows, cols, left, top, width, height).table

        tbl.cell(0, 0).text = 'Indicator'
        tbl.cell(0, 1).text = 'Value'
        for i, (label, value) in enumerate(rows, start=1):
            tbl.cell(i, 0).text = str(label)
            tbl.cell(i, 1).text = str(value)

    # Slide 3: Narrative (if provided)
    if narrative:
        blank_layout = prs.slide_layouts[5]
        slide3 = prs.slides.add_slide(blank_layout)
        txBox = slide3.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(6.5))
        tf = txBox.text_frame
        tf.word_wrap = True
        tf.text = narrative[:800]

    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()
