"""Closed modern water/coast polygons for manual identity review, using a search guide."""
import json,sys
from pathlib import Path
import numpy as np
from shapely.geometry import shape
from shapely.ops import polygonize
from PIL import Image,ImageDraw
from tools.church.gcps import load_gcps
from tools.church.residuals import solve_affine
csv,cache,*names=sys.argv[1:];root=Path(cache);references=json.loads((root/'polygon-reference-paths.json').read_text());fs={f['id']:f for p in references for f in json.loads(Path(p).read_text())['features']};lines={fid:shape(f['geometry']) for fid,f in fs.items() if f['properties'].get('FEAT_CODE','').startswith(('WALK','WACO'))};polys=list(polygonize(list(lines.values())))
m=solve_affine([p for p in load_gcps(Path(csv)) if p.role=='control']);A=np.linalg.inv([[m.a,m.b],[m.d,m.e]]);o=np.array([m.c,m.f]);projected=[]
for i,p in enumerate(polys):
 v=np.array(p.exterior.coords);wm=np.c_[np.deg2rad(v[:,0])*6378137,6378137*np.log(np.tan(np.pi/4+np.deg2rad(v[:,1])/2))];px=(wm-o)@A.T;projected.append((i,p,px))
for name in names:
 fr=json.loads((root/(name+'-frame.json')).read_text());x,y=fr['origin'];w,h=fr['extent'];sw,sh=fr['display'];im=Image.new('RGB',(sw,sh),'white');d=ImageDraw.Draw(im);items=[]
 for i,p,px in projected:
  if px[:,0].max()<x or px[:,0].min()>x+w or px[:,1].max()<y or px[:,1].min()>y+h:continue
  pp=(px-[x,y])*[sw/w,sh/h];d.line([tuple(v) for v in pp],fill='#006fa0',width=2);d.text(tuple(pp.mean(axis=0)),str(i),fill='red')
  ids=[fid for fid,l in lines.items() if p.boundary.intersection(l).length>l.length*.99];items.append(dict(index=i,ring=list(p.exterior.coords),feature_ids=ids))
 im.save(root/(name+'-polygons.jpg'));(root/(name+'-rings.json')).write_text(json.dumps(items))
