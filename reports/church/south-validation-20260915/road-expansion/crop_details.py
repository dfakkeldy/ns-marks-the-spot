from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions();C=Path('/var/home/dan/nsmarks-church-20260915/south-roads');src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
packets=[('IS5-mabou-native',18400,13400,1800,1600),('IS5-strathlorne-native',21100,8650,1700,1600),('IS5-orangedale-native',26300,20400,1800,1800),('IS5-granton-native',26700,3050,2100,1500)]
for name,x,y,w,h in packets:
 dw=round(w*.75);dh=round(h*.75)
 mem=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');mem.ReadAsArray();gdal.Translate(str(C/(name+'.jpg')),mem,format='JPEG');(C/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print(name,flush=True)
