"""Draw reference search contexts in the frozen draft's native-source guide frame."""
import json,math,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from tools.church.gcps import load_gcps
from tools.church.residuals import solve_affine
from tools.church.landmarks import polygon_centroid
r=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
fit=solve_affine([p for p in load_gcps(Path(__file__).resolve().parent.parent/'physical-draft.csv') if p.role=='control']);A=np.linalg.inv([[fit.a,fit.b],[fit.d,fit.e]]);offset=np.array([fit.c,fit.f]);parts=[]
for f in json.loads((r/'reference/nstdb-major-water.geojson').read_text())['features']:
 g=f['geometry'];polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
 for pi,poly in enumerate(polys):
  for ri,ring in enumerate(poly):
   a=np.array(ring);world=np.c_[np.deg2rad(a[:,0])*6378137,6378137*np.log(np.tan(np.pi/4+np.deg2rad(a[:,1])/2))];native=(world-offset)@A.T;centroid=None
   if ri:
    try:lon,lat,area=polygon_centroid(ring);w=np.array([6378137*math.radians(lon),6378137*math.log(math.tan(math.pi/4+math.radians(lat)/2))]);centroid=dict(lonlat=[lon,lat],native=((w-offset)@A.T).tolist(),area_sq_deg=area)
    except ValueError:pass
   parts.append((f.get('id'),pi,ri,native,centroid))
frames=[]
for name,x,y,w,h in [('north-islands',12600,4400,2500,1400),('grand-river',20000,14000,7000,6000)]:
 sw=1500;sh=round(h*sw/w);im=Image.new('RGB',(sw,sh),'white');d=ImageDraw.Draw(im);candidates=[]
 for fid,pi,ri,px,c in parts:
  if px[:,0].max()<x or px[:,0].min()>x+w or px[:,1].max()<y or px[:,1].min()>y+h:continue
  xy=(px-[x,y])*[sw/w,sh/h];d.line([tuple(p) for p in xy],fill='#007ba7',width=2)
  if c and x<c['native'][0]<x+w and y<c['native'][1]<y+h:
   idx=len(candidates);candidates.append(dict(index=idx,feature_id=fid,polygon=pi,ring=ri,**c));cx,cy=(np.array(c['native'])-[x,y])*[sw/w,sh/h];d.text((cx,cy),str(idx),fill='red')
 im.save(out/(name+'-reference.png'));frames.append(dict(name=name,origin=[x,y],extent=[w,h],display=[sw,sh],rotation=0,guide='frozen four-control affine, only for search',candidates=candidates))
(out/'search-frames.json').write_text(json.dumps(frames,indent=2)+'\n')
