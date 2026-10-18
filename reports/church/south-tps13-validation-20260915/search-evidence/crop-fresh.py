from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions();C=Path('/var/home/dan/nsmarks-church-20260915/south-fresh');C.mkdir(exist_ok=True);src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
for name,x,y,w,h in [('cranberry',29850,20150,1200,1300),('beaver-dam',20100,28750,1600,1600)]:
 mem=gdal.Translate('',src,srcWin=[x,y,w,h],width=w,height=h,format='MEM');mem.ReadAsArray();name='IS7-'+name+'-native';gdal.Translate(str(C/(name+'.jpg')),mem,format='JPEG');(C/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[w,h],rotation=0)));print(name,flush=True)
