from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions()
C=Path('/var/home/dan/nsmarks-church-20260915/south-northern');src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
mem=gdal.Translate('',src,srcWin=[30100,3750,1900,1600],width=1425,height=1200,format='MEM');mem.ReadAsArray()
gdal.Translate(str(C/'IS4-ryan-native.jpg'),mem,format='JPEG')
(C/'IS4-ryan-native-frame.json').write_text(json.dumps(dict(county='inverness',source=src,origin=[30100,3750],extent=[1900,1600],display=[1425,1200],rotation=0)))
