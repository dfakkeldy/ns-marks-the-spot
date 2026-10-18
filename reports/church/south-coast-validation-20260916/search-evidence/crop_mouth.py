from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';r=Path('/var/home/dan/nsmarks-church-20260916/south-mouth');r.mkdir(parents=True,exist_ok=True);x,y,w,h,dw,dh=20500,6100,2200,1900,1540,1330;v=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');v.ReadAsArray();gdal.Translate(str(r/'broad-cove-mouth.jpg'),v,format='JPEG');(r/'broad-cove-mouth-frame.json').write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print('Mouth crop complete',flush=True)
