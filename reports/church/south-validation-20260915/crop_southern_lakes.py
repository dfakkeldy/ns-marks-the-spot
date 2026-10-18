from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions();C=Path('/var/home/dan/nsmarks-church-20260915/south-validation');src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
for name,x,y,w,h,dw in [('IS3-murray-native',18600,28800,2400,1800,1600),('IS3-horton-native',18000,29800,2000,1900,1500)]:
 dh=round(h*dw/w);mem=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');mem.ReadAsArray();gdal.Translate(str(C/(name+'.jpg')),mem,format='JPEG');(C/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print(name,flush=True)
