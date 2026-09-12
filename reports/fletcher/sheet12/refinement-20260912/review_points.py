"""Reuse the full-sheet native/reference reviewer for this refinement.
Usage: python review_points.py RECORD_JSON OUTPUT_NAME RADIUS_PX RANGE_M ID...
"""
from pathlib import Path
import sys
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
p=ROOT/'reports/fletcher/full-sheets/review_points.py'
record,out,radius,metres,*ids=sys.argv[1:]
src=p.read_text().replace('out = ROOT / "full-sheets/review"',f'out = ROOT / "sheet12/refinement-20260912/{out}"').replace('110',radius).replace('450',metres)
ns={'__file__':str(p),'__name__':'review_module'}
exec(compile(src,str(p),'exec'),ns)
ns['PACKETS']=[('12','sheet12/refinement-20260912/'+record,'fletcher-sheet12/native/sheet12.png','fletcher-sheet12/reference-full',ids)]
ns['main']()
