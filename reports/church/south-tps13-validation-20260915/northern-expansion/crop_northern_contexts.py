from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions();src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';r=Path('/var/home/dan/nsmarks-church-20260915/south-northern-fresh');r.mkdir(exist_ok=True)
for name,x,y,w,h,dw,dh in [('broad-cove',20500,4000,5000,4000,1500,1200),('margaree-forks',25000,1600,6000,4500,1600,1200)]:
 mem=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');mem.ReadAsArray();gdal.Translate(str(r/(name+'-context.jpg')),mem,format='JPEG');(r/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print(name,flush=True)
