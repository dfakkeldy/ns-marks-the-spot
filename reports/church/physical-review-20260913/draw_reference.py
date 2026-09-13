"""Direct geographic crosshairs for recorded observations; no historical warp."""
import json,sys,math
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
manifest=Path(sys.argv[1]);out=manifest.parent;fs={f['id']:f for p in sys.argv[2:] for f in json.loads(Path(p).read_text())['features']};obs=json.loads(manifest.read_text());points=obs.get('points',[obs])
for p in points:
 lon,lat=p['lonlat'];c=math.cos(math.radians(lat));span=1600;im=Image.new('RGB',(1000,1000),'white');d=ImageDraw.Draw(im)
 def px(v):return ((v[0]-lon)*111195*c/span*1000+500,500-(v[1]-lat)*111195/span*1000)
 selected=[]
 for fid,f in fs.items():
  g=f['geometry'];parts=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
  for r in parts:
   v=np.asarray(r);lo=v.min(axis=0);hi=v.max(axis=0)
   if hi[0]<lon-span/2/111195/c or lo[0]>lon+span/2/111195/c or hi[1]<lat-span/2/111195 or lo[1]>lat+span/2/111195:continue
   a=np.c_[(v[:,0]-lon)*111195*c/span*1000+500,500-(v[:,1]-lat)*111195/span*1000];
   if a[:,0].max()<0 or a[:,0].min()>1000 or a[:,1].max()<0 or a[:,1].min()>1000:continue
   d.line([tuple(v) for v in a],fill='#0077aa',width=2);selected.append(f)
 d.line((475,500,525,500),fill='red',width=3);d.line((500,475,500,525),fill='red',width=3);d.text((10,10),p['id']+' modern reference; 1600 ground-metre window; north up',fill='black');im.save(out/(p['id']+'-reference-review.jpg'),quality=92)
 (out/(p['id']+'-reference-features.geojson')).write_text(json.dumps(dict(type='FeatureCollection',features=list({f['id']:f for f in selected}.values()))))
