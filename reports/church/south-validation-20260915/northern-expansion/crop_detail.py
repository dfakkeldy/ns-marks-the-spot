from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions()
C=Path('/var/home/dan/nsmarks-church-20260915/south-northern')
src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
for name,x,y,w,h,dw in [('IS4-olaw-native',30750,4650,1600,2500,960),('IS4-sheas-native',20200,14800,1800,1600,1350)]:
 dh=round(h*dw/w)
 mem=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');mem.ReadAsArray()
 gdal.Translate(str(C/(name+'.jpg')),mem,format='JPEG')
 (C/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)))
 print(name,flush=True)
