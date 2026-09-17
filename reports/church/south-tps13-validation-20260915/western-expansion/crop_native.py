from pathlib import Path
import json,hashlib
from osgeo import gdal
gdal.UseExceptions();src=Path('/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2');assert hashlib.sha256(src.read_bytes()).hexdigest()=='37021ed086f7bbce542b519e9a74242acc5b53ed1944880468f6f91d6234a7f8';r=Path('/var/home/dan/nsmarks-church-20260915/south-western');r.mkdir(exist_ok=True);
for name,x,y,w,h,dw,dh in [('port-hood',13200,16000,1800,1800,1440,1440),('henry',12550,17100,1200,1300,1200,1300)]:
 mem=gdal.Translate('',str(src),srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');mem.ReadAsArray();gdal.Translate(str(r/(name+'-native.jpg')),mem,format='JPEG');(r/(name+'-frame.json')).write_text(json.dumps({'county':'inverness','source':str(src),'origin':[x,y],'extent':[w,h],'display':[dw,dh],'rotation':0}));print(name,flush=True)
