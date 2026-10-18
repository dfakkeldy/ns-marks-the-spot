from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';r=Path('/var/home/dan/nsmarks-church-20260916/south-interior');r.mkdir(parents=True,exist_ok=True)
for name,x,y,w,h,dw,dh in [('frasers',21000,8500,1300,1400,1300,1400),('east-junction',25200,10600,1800,1500,1440,1200),('trout-mouth',25200,12700,1400,1300,1400,1300)]:
 mem=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');mem.ReadAsArray();gdal.Translate(str(r/(name+'-native.jpg')),mem,format='JPEG');(r/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print(name,flush=True)
