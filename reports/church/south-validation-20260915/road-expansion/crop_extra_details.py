from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions();C=Path('/var/home/dan/nsmarks-church-20260915/south-roads');src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
for name,x,y,w,h in [('IS5-ainslie-glen-native',25900,14750,1800,1600),('IS5-glencoe-native',20200,17600,1800,1700)]:
 dw=round(w*.75);dh=round(h*.75);mem=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');mem.ReadAsArray();gdal.Translate(str(C/(name+'.jpg')),mem,format='JPEG');(C/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print(name,flush=True)
