from pathlib import Path
import json,hashlib
from osgeo import gdal
gdal.UseExceptions();src=Path('/var/home/dan/nsmarks-church-20260726/sources/downloads/richmond/richmond.tif');assert hashlib.sha256(src.read_bytes()).hexdigest()=='462194ca1ca810d88416d7cd344f17c5f37acf20c8e43381dc3064668010a5f7';C=Path('/var/home/dan/nsmarks-church-20260915/richmond-south-seam');C.mkdir(exist_ok=True);ds=gdal.Open(str(src));print('source',ds.RasterXSize,ds.RasterYSize,flush=True)
for name,x,y,w,h in [('cranberry',12150,4450,1200,1200),('crammond-sw',9000,10600,1400,1600)]:
 mem=gdal.Translate('',ds,srcWin=[x,y,w,h],width=w,height=h,format='MEM');mem.ReadAsArray();gdal.Translate(str(C/(name+'-native.jpg')),mem,format='JPEG');(C/(name+'-frame.json')).write_text(json.dumps(dict(county='richmond',source=str(src),source_dimensions=[ds.RasterXSize,ds.RasterYSize],origin=[x,y],extent=[w,h],display=[w,h],rotation=0)));print(name,flush=True)
