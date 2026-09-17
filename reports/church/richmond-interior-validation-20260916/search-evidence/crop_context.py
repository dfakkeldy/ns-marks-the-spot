from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();r=Path('/var/home/dan/nsmarks-church-20260916/richmond-interior');r.mkdir(parents=True,exist_ok=True);src='/var/home/dan/nsmarks-church-20260726/sources/downloads/richmond/richmond.tif';ds=gdal.Open(src)
for name,x,y,w,h,dw,dh in [('whole',0,0,35735,30429,1787,1521),('west-interior',4200,11000,8500,8500,1530,1530)]:
 v=gdal.Translate('',ds,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');v.ReadAsArray();gdal.Translate(str(r/(name+'.jpg')),v,format='JPEG');(r/(name+'-frame.json')).write_text(json.dumps(dict(county='richmond',source=src,source_dimensions=[35735,30429],origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print(name,flush=True)
