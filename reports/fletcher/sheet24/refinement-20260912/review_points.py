from pathlib import Path
import sys
R=Path.cwd(); D=R/'reports/fletcher/sheet24'; L=Path.home()/'Downloads/fletcher-sheet24'
p=R/'reports/fletcher/full-sheets/review_points.py';ns={'__file__':str(p),'__name__':'review_module'}
src=p.read_text().replace('out = ROOT / "full-sheets/review"',f'out = ROOT / "sheet24/{sys.argv[2]}"')
src=src.replace('- 110', '- '+sys.argv[3]).replace('+ 110', '+ '+sys.argv[3]).replace('450',sys.argv[4])
exec(compile(src,str(p),'exec'),ns);ns['PACKETS']=[('24','sheet24/'+sys.argv[1],str(L/'native/sheet24.png'),str(L/'reference-full'),sys.argv[5:])];ns['main']()
