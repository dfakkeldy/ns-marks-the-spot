from pathlib import Path
import sys
R=Path.cwd(); D=R/'reports/fletcher/sheet18'; L=Path.home()/'Downloads/fletcher-sheet18'
p=R/'reports/fletcher/full-sheets/review_points.py';ns={'__file__':str(p),'__name__':'review_module'}
src=p.read_text().replace('out = ROOT / "full-sheets/review"',f'out = ROOT / "sheet18/{sys.argv[2]}"')
exec(compile(src,str(p),'exec'),ns);ns['PACKETS']=[('18','sheet18/'+sys.argv[1],str(L/'native/sheet18.png'),str(L/'reference-full'),sys.argv[3:])];ns['main']()
