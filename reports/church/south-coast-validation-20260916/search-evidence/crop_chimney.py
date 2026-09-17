from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';r=Path('/var/home/dan/nsmarks-church-20260916/south-mouth');x,y,w,h,dw,dh=23300,0,3600,2700,1440,1080;v=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');v.ReadAsArray();gdal.Translate(str(r/'chimney-context.jpg'),v,format='JPEG');(r/'chimney-frame.json').write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print('Chimney context complete',flush=True)
