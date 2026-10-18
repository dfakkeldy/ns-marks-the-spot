from pathlib import Path
import sys
R=Path.cwd();L=Path.home()/'Downloads/fletcher-sheet01';p=R/'reports/fletcher/full-sheets/review_points.py';ns={'__file__':str(p),'__name__':'review_module'}
src=p.read_text().replace('out = ROOT / "full-sheets/review"',f'out = ROOT / "sheet01/{sys.argv[2]}"')
if '--wide' in sys.argv:src=src.replace('110','350').replace('450','1300')
exec(compile(src,str(p),'exec'),ns);ns['PACKETS']=[('01','sheet01/'+sys.argv[1],str(L/'native/sheet01.png'),str(L/'reference-full'),sys.argv[3:])];ns['main']()
