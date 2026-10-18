from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions();src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';r=Path('/var/home/dan/nsmarks-church-20260915/south-northern-fresh');r.mkdir(exist_ok=True)
for name,x,y,w,h in [('dunvegan-marsh',22300,4250,1600,1300),('margaree-fork',26700,2900,1700,1700)]:
 mem=gdal.Translate('',src,srcWin=[x,y,w,h],width=w,height=h,format='MEM');mem.ReadAsArray();gdal.Translate(str(r/(name+'-native.jpg')),mem,format='JPEG');(r/(name+'-native-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[w,h],rotation=0)));print(name,flush=True)
