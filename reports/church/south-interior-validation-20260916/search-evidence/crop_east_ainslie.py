from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';r=Path('/var/home/dan/nsmarks-church-20260916/south-interior');r.mkdir(parents=True,exist_ok=True);x,y,w,h,dw,dh=23700,9500,5000,5000,1500,1500;mem=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');mem.ReadAsArray();gdal.Translate(str(r/'east-ainslie-context.jpg'),mem,format='JPEG');(r/'east-ainslie-frame.json').write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print('East Ainslie context complete',flush=True)
