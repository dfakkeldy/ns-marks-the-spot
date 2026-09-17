from pathlib import Path
from osgeo import gdal
import json
r=Path('/var/home/dan/nsmarks-church-20260916/south-southern');r.mkdir(parents=True,exist_ok=True)
src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
x,y,w,h,dw,dh=14500,20500,6500,8500,1170,1530
v=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');v.ReadAsArray();gdal.Translate(str(r/'southern-context.jpg'),v,format='JPEG')
(r/'southern-context-frame.json').write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)))
print('Southern context complete',flush=True)
