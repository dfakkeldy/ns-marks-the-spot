from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();r=Path('/var/home/dan/nsmarks-church-20260916/south-western-coast');src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';ds=gdal.Open(src)
for name,x,y in [('finlay',16200,10750),('green',15550,12250),('sight',17100,8800)]:
 v=gdal.Translate('',ds,srcWin=[x,y,1600,1600],width=1600,height=1600,format='MEM');v.ReadAsArray();gdal.Translate(str(r/(name+'-native.jpg')),v,format='JPEG');(r/(name+'-native-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[1600,1600],display=[1600,1600],rotation=0)));print(name+' complete',flush=True)
