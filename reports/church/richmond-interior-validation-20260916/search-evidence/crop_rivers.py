from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();r=Path('/var/home/dan/nsmarks-church-20260916/richmond-interior');src='/var/home/dan/nsmarks-church-20260726/sources/downloads/richmond/richmond.tif';ds=gdal.Open(src)
for name,x,y,w,h,dw,dh in [('black-river',8200,13700,3200,2100,1600,1050),('rae-brook',9800,15300,2400,2100,1560,1365)]:
 v=gdal.Translate('',ds,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');v.ReadAsArray();gdal.Translate(str(r/(name+'.jpg')),v,format='JPEG');(r/(name+'-frame.json')).write_text(json.dumps(dict(county='richmond',source=src,source_dimensions=[35735,30429],origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print(name,flush=True)
