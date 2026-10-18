"""Draw NSTDB water in the old graticule's source frame for identity search only.

This is a search guide, never independent warp validation. Usage:
PYTHONPATH=. python review_reference.py DATA_DIRECTORY
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from tools.church.gcps import load_gcps
from tools.church.residuals import solve_affine
from tools.church.geometry import lonlat_to_mercator

root=Path(sys.argv[1])
model=solve_affine(load_gcps(Path('tools/church/gcps/inverness-north.csv')))
mat=np.array([[model.a,model.b],[model.d,model.e]])
offset=np.array([model.c,model.f])
features=json.loads((root/'reference/water-lines.geojson').read_text())['features']
frames=[dict(name=n,origin=[x,y],extent=[w,h],display=[1500,round(h*1500/w)]) for n,x,y,w,h in [('north-tip',9500,800,6000,5500),('polletts',6000,5000,6500,6500),('pleasant',3500,10000,6500,6500),('fishing',2000,14500,7000,6500),('cheticamp',1000,19000,7000,6500),('margaree',1000,24500,9000,4800)]]
parts=[]
for f in features:
 g=f['geometry']; polys=[[g['coordinates']]] if g['type']=='LineString' else [g['coordinates']]
 for pi,poly in enumerate(polys):
  for ri,ring in enumerate(poly):
   world=np.array([lonlat_to_mercator(*p[:2]) for p in ring]); pixels=(world-offset)@np.linalg.inv(mat).T
   parts.append((f.get('id'),pi,ri,pixels))
for frame in frames:
 x,y=frame['origin'];w,h=frame['extent']; sw,sh=frame['display'];im=Image.new('RGB',(sw,sh),'#fafafa');d=ImageDraw.Draw(im)
 for fid,pi,ri,p in parts:
  if p[:,0].max()<x or p[:,0].min()>x+w or p[:,1].max()<y or p[:,1].min()>y+h:continue
  pts=(p-[x,y])*[sw/w,sh/h];d.line([tuple(a) for a in pts],fill='#007eaa',width=2)
 for px in range((x//1000+1)*1000,x+w,1000):
  dx=(px-x)*sw/w;d.line((dx,0,dx,sh),fill='#ddd');d.text((dx+3,20),str(px),fill='black')
 for py in range((y//1000+1)*1000,y+h,1000):
  dy=(py-y)*sh/h;d.line((0,dy,sw,dy),fill='#ddd');d.text((3,dy+2),str(py),fill='black')
 im.save(root/(frame['name']+'-reference.png'))
(root/'north-search-guide.json').write_text(json.dumps({'source_frame':'inverness original 34427x34543','guide':'least-squares affine of existing printed-graticule controls; not geographic acceptance','model':model.__dict__,'frames':frames},indent=2)+'\n')
