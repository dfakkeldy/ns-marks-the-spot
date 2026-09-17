import json,time,hashlib
from pathlib import Path
from osgeo import gdal
start=time.monotonic();gdal.UseExceptions()
p=Path('/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2')
out=Path('/var/home/dan/nsmarks-church-20260914/inverness-north-review')
image=out/'IN2-north-context-mem.jpg'
print('Opening original JP2; one MEM translation',flush=True)
mem=gdal.Translate('',str(p),srcWin=[11800,800,3900,5400],width=1300,height=1800,format='MEM')
print('MEM crop complete',round(time.monotonic()-start,2),flush=True)
gdal.Translate(str(image),mem,format='JPEG')
frame=dict(county='inverness',source=str(p),origin=[11800,800],extent=[3900,5400],display=[1300,1800],rotation=0)
(out/'IN2-north-context-mem-frame.json').write_text(json.dumps(frame,indent=2)+'\n')
print('Complete',round(time.monotonic()-start,2),flush=True)
