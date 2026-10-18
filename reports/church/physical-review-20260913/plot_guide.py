"""Search-only affine reference views; predictions never establish correspondence."""
import argparse,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from tools.church.gcps import load_gcps
from tools.church.residuals import solve_affine

def main():
 p=argparse.ArgumentParser();p.add_argument('--csv',type=Path,required=True);p.add_argument('--frame',type=Path,required=True);p.add_argument('--reference',type=Path,action='append',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 m=solve_affine([p for p in load_gcps(a.csv) if p.role=='control']);A=np.linalg.inv([[m.a,m.b],[m.d,m.e]]);o=np.array([m.c,m.f]);fr=json.loads(a.frame.read_text());x,y=fr['origin'];w,h=fr['extent'];sw,sh=fr['display'];im=Image.new('RGB',(sw,sh),'white');d=ImageDraw.Draw(im);ends=[];seen=set();features={f['id']:f for path in a.reference for f in json.loads(path.read_text())['features']}
 selected=[]
 for f in features.values():
  g=f['geometry'];rs=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
  for ri,r in enumerate(rs):
   v=np.array(r);wm=np.c_[np.deg2rad(v[:,0])*6378137,6378137*np.log(np.tan(np.pi/4+np.deg2rad(v[:,1])/2))];px=(wm-o)@A.T
   if px[:,0].max()<x or px[:,0].min()>x+w or px[:,1].max()<y or px[:,1].min()>y+h:continue
   pp=(px-[x,y])*[sw/w,sh/h];color='#006fa0' if f['properties'].get('FEAT_CODE','').startswith(('WALK','WACO')) else '#aaaabb';d.line([tuple(v) for v in pp],fill=color,width=2);selected.append(f)
   for k in [0,len(px)-1]:
    key=tuple(v[k,:2]);xp,yp=px[k]
    if x<xp<x+w and y<yp<y+h and key not in seen:
     seen.add(key);idx=len(ends);sx,sy=pp[k];d.text((sx+2,sy),str(idx),fill='red');ends.append(dict(index=idx,feature_id=f['id'],part=ri,vertex=k,lonlat=v[k,:2].tolist(),guide_pixel=[xp,yp],properties=f['properties']))
 im.save(a.out.with_suffix('.jpg'),quality=93);a.out.with_suffix('.json').write_text(json.dumps(dict(**fr,guide_csv=str(a.csv),warning='Search-only affine guide; not identity evidence or actual raster validation',endpoints=ends),indent=2)+'\n')
 a.out.with_name(a.out.name+'-features').with_suffix('.geojson').write_text(json.dumps(dict(type='FeatureCollection',features=selected)))
if __name__=='__main__':main()
