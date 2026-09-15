from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions();C=Path('/var/home/dan/nsmarks-church-20260915/south-validation');src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
for name,x,y,w,h in [('IS3-macneil-native',14200,17700,1300,1300),('IS3-long-native',15300,24550,1200,1400),('IS3-brileys-native',17800,26500,1600,1700)]:
 mem=gdal.Translate('',src,srcWin=[x,y,w,h],format='MEM');mem.ReadAsArray();gdal.Translate(str(C/(name+'.jpg')),mem,format='JPEG');(C/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[w,h],rotation=0)));print(name,flush=True)
