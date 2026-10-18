from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();r=Path('/var/home/dan/nsmarks-church-20260916/south-extension');r.mkdir(parents=True,exist_ok=True);src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
x,y,w,h,dw,dh=16600,28700,7000,5800,1400,1160
v=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');v.ReadAsArray();gdal.Translate(str(r/'extension-context.jpg'),v,format='JPEG');(r/'extension-context-frame.json').write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print('Extension crop complete',flush=True)
