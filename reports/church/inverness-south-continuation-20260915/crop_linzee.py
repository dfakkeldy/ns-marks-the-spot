from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions()
s='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';r=Path('/var/home/dan/nsmarks-church-20260912/target-refinement-20260913/crops');name='IS2-linzee-native'
mem=gdal.Translate('',s,srcWin=[13750,14900,1300,1400],width=1300,height=1400,format='MEM');mem.ReadAsArray();gdal.Translate(str(r/(name+'.jpg')),mem,format='JPEG');(r/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=s,origin=[13750,14900],extent=[1300,1400],display=[1300,1400],rotation=0)))
