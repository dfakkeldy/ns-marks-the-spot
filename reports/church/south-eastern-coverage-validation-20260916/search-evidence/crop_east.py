from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();r=Path('/var/home/dan/nsmarks-church-20260916/south-eastern-coverage');r.mkdir(parents=True,exist_ok=True);src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
x,y,w,h,dw,dh=27500,14300,6000,9500,960,1520
v=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');v.ReadAsArray();gdal.Translate(str(r/'east-context.jpg'),v,format='JPEG');(r/'east-context-frame.json').write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print('East context complete',flush=True)
