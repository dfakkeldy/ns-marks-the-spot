from pathlib import Path
from osgeo import gdal
import json
gdal.UseExceptions()
s='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2';r=Path('/var/home/dan/nsmarks-church-20260912/target-refinement-20260913/crops');name='IS2-skye-junction-mem'
mem=gdal.Translate('',s,srcWin=[24900,15500,2600,2500],width=1560,height=1500,format='MEM');mem.ReadAsArray();gdal.Translate(str(r/(name+'.jpg')),mem,format='JPEG');(r/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=s,origin=[24900,15500],extent=[2600,2500],display=[1560,1500],rotation=0)))
