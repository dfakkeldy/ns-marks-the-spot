"""Show the two northern points with original water and transport context."""
from pathlib import Path
import json,math
import numpy as np
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parent;C=Path('/Users/dfakkeldy/Downloads/church-south-road-validation-20260915')
paths={'water':Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson'),'roads':C/'roads.geojson','highways':C/'highways.geojson'}
features={kind:json.loads(p.read_text())['features'] for kind,p in paths.items()}
for id in ['IS39','IS40']:
 o=json.loads((R/'observations'/(id+'.json')).read_text());lon,lat=o['lonlat'];c=math.cos(math.radians(lat));span=1600;im=Image.new('RGB',(1000,1040),'white');d=ImageDraw.Draw(im);picked=[];primary=[]
 def px(v):return ((v[0]-lon)*111195*c/span*1000+500,500-(v[1]-lat)*111195/span*1000)
 for kind,fs in features.items():
  for f in fs:
   if f['geometry']['type']!='LineString':continue
   a=np.asarray(f['geometry']['coordinates']);lo=a.min(axis=0);hi=a.max(axis=0)
   if hi[0]<lon-span/2/111195/c or lo[0]>lon+span/2/111195/c or hi[1]<lat-span/2/111195 or lo[1]>lat+span/2/111195:continue
   d.line([px(p) for p in a],fill='#0077aa' if kind=='water' else '#111111' if kind=='highways' else '#b86818',width=2);picked.append({'reference_path':str(paths[kind]),'feature':f})
   if str(paths[kind])==o['reference_path']:primary.append(f)
 d.line((480,500,520,500),fill='red',width=3);d.line((500,480,500,520),fill='red',width=3);d.rectangle((0,1000,1000,1040),fill='white');d.text((10,1006),id+' exact original reference coordinate; 1600 ground-metre window; north up',fill='black');d.text((10,1022),'Original NSTDB: blue water, black highway, brown road. Red + is the adopted point.',fill='black');im.save(R/'observations'/(id+'-reference-review.jpg'),quality=94);(R/'observations'/(id+'-reference-features.geojson')).write_text(json.dumps({'type':'FeatureCollection','features':primary})+'\n');(R/'northern-expansion'/(id+'-reference-context.json')).write_text(json.dumps(picked)+'\n')
