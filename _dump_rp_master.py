import sys
from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
sys.stdout.reconfigure(encoding='utf-8')

PATH = r'C:\Users\HP\Downloads\January to June Action Plan_2026_Kurigram.docx'
doc = Document(PATH)

def iter_blocks(parent):
    for child in parent.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)

out = []
ti = 0
for block in iter_blocks(doc):
    if isinstance(block, Paragraph):
        t = block.text.strip()
        if t:
            out.append('P[%s]: %s' % (block.style.name, t))
    else:
        ti += 1
        try:
            ncol = len(block.columns)
        except Exception:
            ncol = '?'
        out.append('\n===== TABLE %d (%d rows x %s cols) =====' % (ti, len(block.rows), ncol))
        for ri, row in enumerate(block.rows):
            cells = []
            for c in row.cells:
                cells.append((c.text or '').replace('\n', ' / ').strip())
            out.append('  R%02d | %s' % (ri, ' || '.join(cells)))

text = '\n'.join(out)
open(r'C:\Users\HP\Documents\spondon_clone\_rp_master_dump.md', 'w', encoding='utf-8').write(text)
print('LINES:', len(out), ' TABLES:', ti)
print(text[:9000])
