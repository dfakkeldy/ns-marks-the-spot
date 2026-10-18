from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();r=Path('/var/home/dan/nsmarks-church-20260916/south-northeast');src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';ds=gdal.Open(src)
for name,x,y,w,h,dw,dh in [('nile-native',31200,2800,1600,1600,1600,1600),('ingram-native',31000,900,1500,1500,1500,1500)]:
 v=gdal.Translate('',ds,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');v.ReadAsArray();gdal.Translate(str(r/(name+'.jpg')),v,format='JPEG');(r/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print(name+' complete',flush=True)
