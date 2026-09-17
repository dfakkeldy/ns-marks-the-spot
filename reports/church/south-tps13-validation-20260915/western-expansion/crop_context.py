from pathlib import Path
import json,hashlib
from osgeo import gdal
gdal.UseExceptions();src=Path('/var/home/dan/nsmarks-church-20260726/sources/inverness.jp2');assert hashlib.sha256(src.read_bytes()).hexdigest()=='37021ed086f7bbce542b519e9a74242acc5b53ed1944880468f6f91d6234a7f8';r=Path('/var/home/dan/nsmarks-church-20260915/south-western');r.mkdir(exist_ok=True);x,y,w,h,dw,dh=11200,15000,4200,5000,1260,1500;mem=gdal.Translate('',str(src),srcWin=[x,y,w,h],width=dw,height=dh,format='MEM');mem.ReadAsArray();gdal.Translate(str(r/'islands-context.jpg'),mem,format='JPEG');(r/'islands-context-frame.json').write_text(json.dumps({'county':'inverness','source':str(src),'origin':[x,y],'extent':[w,h],'display':[dw,dh],'rotation':0}));print('context complete',flush=True)
