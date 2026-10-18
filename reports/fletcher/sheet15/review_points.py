from pathlib import Path
import sys
R=Path.cwd(); D=R/'reports/fletcher/sheet15'; L=Path.home()/'Downloads/fletcher-sheet15'
p=R/'reports/fletcher/full-sheets/review_points.py';ns={'__file__':str(p),'__name__':'review_module'}
src=p.read_text().replace('out = ROOT / "full-sheets/review"',f'out = ROOT / "sheet15/{sys.argv[2]}"')
exec(compile(src,str(p),'exec'),ns);ns['PACKETS']=[('15','sheet15/'+sys.argv[1],str(L/'native/sheet15.png'),str(L/'reference-full'),sys.argv[3:])];ns['main']()
