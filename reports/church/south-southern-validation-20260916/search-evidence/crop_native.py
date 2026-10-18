from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();r=Path('/var/home/dan/nsmarks-church-20260916/south-southern');src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
for name,x,y,w,h,dw,dh in [('macleod-native',19300,19800,1300,1500,1300,1500),('lamey-native',19600,27400,1300,1500,1300,1500)]:
 v=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');v.ReadAsArray();gdal.Translate(str(r/(name+'.jpg')),v,format='JPEG');(r/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print(name+' complete',flush=True)
