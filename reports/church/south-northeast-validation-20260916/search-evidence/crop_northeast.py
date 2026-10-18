from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();r=Path('/var/home/dan/nsmarks-church-20260916/south-northeast');r.mkdir(parents=True,exist_ok=True);src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
x,y,w,h,dw,dh=27000,800,6500,8900,1040,1424
v=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');v.ReadAsArray();gdal.Translate(str(r/'northeast-context.jpg'),v,format='JPEG');(r/'northeast-context-frame.json').write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print('Northeast context complete',flush=True)
