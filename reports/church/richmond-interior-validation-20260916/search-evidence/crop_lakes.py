from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();r=Path('/var/home/dan/nsmarks-church-20260916/richmond-interior');src='/var/home/dan/nsmarks-church-20260726/sources/downloads/richmond/richmond.tif';ds=gdal.Open(src)
for name,x,y,w,h in [('false-bay',10850,15200,1500,1200),('buchanan',8800,14900,1600,1600)]:
 v=gdal.Translate('',ds,srcWin=[x,y,w,h],width=w,height=h,format='MEM');v.ReadAsArray();gdal.Translate(str(r/(name+'-native.jpg')),v,format='JPEG');(r/(name+'-frame.json')).write_text(json.dumps(dict(county='richmond',source=src,source_dimensions=[35735,30429],origin=[x,y],extent=[w,h],display=[w,h],rotation=0)));print(name,flush=True)
