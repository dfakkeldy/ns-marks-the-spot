from pathlib import Path
import json,math
import numpy as np
from PIL import Image,ImageDraw
C=Path(__file__).parent
DATA=Path('/Users/dfakkeldy/Downloads/church-south-road-validation-20260915')
features=[]
for layer,name in [(8,'roads'),(7,'highways'),(5,'bridges'),(6,'railways')]:
 for f in json.loads((DATA/(name+'.geojson')).read_text())['features']:
  if f['geometry']['type']=='LineString':features.append((layer,f))
water={}
for p in ['/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson','/Users/dfakkeldy/Downloads/church-review-20260913/south-west-water-lines.geojson','/Users/dfakkeldy/Downloads/church-south-validation-20260915/southwest-water-lines.geojson',str(C/'interior-water.geojson')]:
 for f in json.loads(Path(p).read_text())['features']:water[f['properties']['OBJECTID']]=f
for f in water.values():
 if f['geometry']['type']=='LineString':features.append((0,f))
data=[]
for layer,f in features:
 a=np.asarray(f['geometry']['coordinates'])[:,:2];data.append((layer,f,a,a.min(axis=0),a.max(axis=0)))
for p in json.loads((C/'search-packets.json').read_text()):
 lon,lat=p['lonlat'];c=math.cos(math.radians(lat));span=6000;size=1250
 bounds=[lon-span/2/111195/c,lat-span/2/111195,lon+span/2/111195/c,lat+span/2/111195]
 im=Image.new('RGB',(size,size),'white');d=ImageDraw.Draw(im);selected=[]
 for layer,f,a,lo,hi in data:
  if hi[0]<bounds[0] or lo[0]>bounds[2] or hi[1]<bounds[1] or lo[1]>bounds[3]:continue
  v=np.c_[(a[:,0]-lon)*111195*c/span*size+size/2,size/2-(a[:,1]-lat)*111195/span*size]
  street=f['properties'].get('STREET','').strip();minor=street in {'','Track','Driveway','Dryweather','Trail'}
  color='#8c2638' if layer==6 else '#007fa0' if layer==0 else '#9b53aa' if layer==5 else '#343a40' if layer==7 else '#bfc0c0' if minor else '#bd6600'
  d.line([tuple(q) for q in v],fill=color,width=1 if layer==0 or minor else 2)
  selected.append(dict(layer=layer,feature=f))
 x=y=size/2;d.line((x-20,y,x+20,y),fill='red',width=3);d.line((x,y-20,x,y+20),fill='red',width=3)
 d.text((10,10),p['name']+' - direct reference context, 6000 ground metres, north up',fill='black')
 d.text((10,28),'Blue: water; orange: local roads; black: highways; purple: bridges; red: railways; gray: tracks/driveways',fill='black')
 im.save(C/(p['name']+'-transport-reference.jpg'),quality=94)
 (C/(p['name']+'-transport-reference-features.json')).write_text(json.dumps(selected))
 print(p['name'],len(selected),flush=True)
