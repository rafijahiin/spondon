import sys
sys.stdout.reconfigure(encoding='utf-8')
from pyxform.xls2xform import xls2xform_convert

xlsx = r'_ciprb_build\CIPRB-2_MPDSR_Form_01_Community_Maternal.xlsx'
xml = r'_ciprb_build\form01_preview.xml'
try:
    warnings = xls2xform_convert(xlsform_path=xlsx, xform_path=xml, validate=False)
    print('CONVERTED OK — XLSForm is structurally valid.')
    for w in (warnings or []):
        print('WARN:', w)
except Exception as e:
    print('PYXFORM ERROR:')
    print(repr(e))
    sys.exit(1)
