import json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from tools.church.gcps import load_gcps
from tools.church.residuals import solve_affine
root=Path(sys.argv[1]);m=solve_affine([p for p in load_gcps(Path('reports/church/physical-review-20260912/richmond/physical-draft.csv')) if p.role=='control']);A=np.linalg.inv([[m.a,m.b],[m.d,m.e]]);o=np.array([m.c,m.f]);parts=[]
for f in json.loads((root/'saint-esprit-water-lines.geojson').read_text())['features']:
 g=f['geometry'];rs=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
 for ri,r in enumerate(rs):
  a=np.array(r);w=np.c_[np.deg2rad(a[:,0])*6378137,6378137*np.log(np.tan(np.pi/4+np.deg2rad(a[:,1])/2))];px=(w-o)@A.T;parts.append((f['id'],ri,a,px,f['properties']))
for name,x,y,w,h in [('saint-esprit-full-lines',24500,12500,8000,6500),('blue-lake-lines',26500,14300,2300,2400),('lochan-lines',27500,12300,2800,2500)]:
 sw=1500;sh=round(h*sw/w);im=Image.new('RGB',(sw,sh),'white');d=ImageDraw.Draw(im);ends=[];seen=set()
 for fid,ri,a,p,pr in parts:
  if p[:,0].max()<x or p[:,0].min()>x+w or p[:,1].max()<y or p[:,1].min()>y+h:continue
  pp=(p-[x,y])*[sw/w,sh/h];color='#006fa0' if pr['FEAT_CODE'].startswith(('WALK','WACO')) else '#666699';d.line([tuple(v) for v in pp],fill=color,width=2)
  if name!='saint-esprit-full-lines':
   for k in [0,len(p)-1]:
    key=tuple(a[k,:2]);xp,yp=p[k]
    if x<xp<x+w and y<yp<y+h and key not in seen:
     seen.add(key);idx=len(ends);sx,sy=pp[k];d.ellipse((sx-2,sy-2,sx+2,sy+2),fill='red');d.text((sx+3,sy),str(idx),fill='black');ends.append(dict(index=idx,feature_id=fid,part=ri,vertex=k,lonlat=a[k,:2].tolist(),guide_pixel=[xp,yp],properties=pr))
 im.save(root/(name+'.png'));(root/(name+'.json')).write_text(json.dumps(dict(origin=[x,y],extent=[w,h],display=[sw,sh],endpoints=ends),indent=2)+'\n')
