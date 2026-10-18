from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions();C=Path('/var/home/dan/nsmarks-church-20260915/south-roads');C.mkdir(exist_ok=True);src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
for p in json.loads((C/'search-packets.json').read_text()):
 name=p['name'];mem=gdal.Translate('',src,srcWin=p['origin']+p['extent'],width=p['display'][0],height=p['display'][1],format='MEM');mem.ReadAsArray();gdal.Translate(str(C/(name+'.jpg')),mem,format='JPEG');(C/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=p['origin'],extent=p['extent'],display=p['display'],rotation=0)));print(name,flush=True)
