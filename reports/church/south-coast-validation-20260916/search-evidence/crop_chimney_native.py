from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions();src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';r=Path('/var/home/dan/nsmarks-church-20260916/south-mouth');x,y,w,h=24400,780,1600,1300;v=gdal.Translate('',src,srcWin=[x,y,w,h],width=w,height=h,format='MEM');v.ReadAsArray();gdal.Translate(str(r/'chimney-native.jpg'),v,format='JPEG');(r/'chimney-native-frame.json').write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[w,h],rotation=0)));print('Native Chimney context complete',flush=True)
