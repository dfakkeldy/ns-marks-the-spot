from pathlib import Path
import sys
R=Path.cwd(); D=R/'reports/fletcher/sheet13'; L=Path.home()/'Downloads/fletcher-sheet13'
p=R/'reports/fletcher/full-sheets/review_points.py';ns={'__file__':str(p),'__name__':'review_module'}
src=p.read_text().replace('out = ROOT / "full-sheets/review"',f'out = ROOT / "sheet13/{sys.argv[2]}"')
exec(compile(src,str(p),'exec'),ns);ns['PACKETS']=[('13','sheet13/'+sys.argv[1],str(L/'native/sheet13.png'),str(L/'reference-full'),sys.argv[3:])];ns['main']()
