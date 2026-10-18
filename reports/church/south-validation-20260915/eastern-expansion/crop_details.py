from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions();C=Path('/var/home/dan/nsmarks-church-20260915/south-eastern');src='/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2'
for name,x,y,w,h,scale in [('denys-west',22100,22000,2000,1800,.75),('denys-east',26600,22300,2000,1800,.75),('portage',29400,18250,2000,1800,.75),('long-stretch',19800,29400,2200,1800,.6)]:
 dw=round(w*scale);dh=round(h*scale);mem=gdal.Translate('',src,srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');mem.ReadAsArray();name='IS6-'+name+'-native';gdal.Translate(str(C/(name+'.jpg')),mem,format='JPEG');(C/(name+'-frame.json')).write_text(json.dumps(dict(county='inverness',source=src,origin=[x,y],extent=[w,h],display=[dw,dh],rotation=0)));print(name,flush=True)
