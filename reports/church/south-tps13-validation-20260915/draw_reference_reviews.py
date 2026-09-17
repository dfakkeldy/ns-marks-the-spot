"""Show adopted reference geometry and exact measurement coordinates."""
from pathlib import Path
import json,math
import numpy as np
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parent
cache={}
for path in [R/f'observations/IS{i}.json' for i in range(34,39)]:
 o=json.loads(path.read_text());key=o['reference_path']
 if key not in cache:cache[key]=json.loads(Path(key).read_text())['features']
 lon,lat=o['lonlat'];c=math.cos(math.radians(lat));span=1600;im=Image.new('RGB',(1000,1040),'white');d=ImageDraw.Draw(im)
 def px(v):return ((v[0]-lon)*111195*c/span*1000+500,500-(v[1]-lat)*111195/span*1000)
 selected=[]
 for f in cache[key]:
  if f['geometry']['type']!='LineString':continue
  v=np.asarray(f['geometry']['coordinates']);lo=v.min(axis=0);hi=v.max(axis=0)
  if hi[0]<lon-span/2/111195/c or lo[0]>lon+span/2/111195/c or hi[1]<lat-span/2/111195 or lo[1]>lat+span/2/111195:continue
  d.line([px(p) for p in v],fill='#0077aa',width=2);selected.append(f)
 if 'modern_ring' in o:d.line([px(p) for p in o['modern_ring']],fill='#00aa99',width=3)
 d.line((480,500,520,500),fill='red',width=3);d.line((500,480,500,520),fill='red',width=3);d.rectangle((0,1000,1000,1040),fill='white');d.text((10,1006),o['id']+' exact reference measurement; 1600 ground-metre window; north up',fill='black');d.text((10,1022),'Original NSTDB. Red +: adopted coordinate; teal: selected exterior; blue: context.',fill='black');im.save(R/'observations'/(o['id']+'-reference-review.jpg'),quality=94)
 (R/'observations'/(o['id']+'-reference-features.geojson')).write_text(json.dumps({'type':'FeatureCollection','features':selected})+'\n')
