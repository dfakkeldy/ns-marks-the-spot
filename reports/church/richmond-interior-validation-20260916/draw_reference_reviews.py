from pathlib import Path
from PIL import Image,ImageDraw
import json,math,numpy as np
R=Path(__file__).resolve().parent
for ident,span in [('R56',2200)]:
 o=json.loads((R/'observations'/(ident+'.json')).read_text());lon,lat=o['lonlat'];c=math.cos(math.radians(lat));im=Image.new('RGB',(1000,1040),'white');d=ImageDraw.Draw(im);selected=[]
 def px(p):return ((p[0]-lon)*111195*c/span*1000+500,500-(p[1]-lat)*111195/span*1000)
 for f in json.loads(Path(o['reference_path']).read_text())['features']:
  if f['geometry']['type']!='LineString':continue
  a=np.array(f['geometry']['coordinates']);lo=a.min(axis=0);hi=a.max(axis=0)
  if hi[0]<lon-span/2/111195/c or lo[0]>lon+span/2/111195/c or hi[1]<lat-span/2/111195 or lo[1]>lat+span/2/111195:continue
  d.line([px(p) for p in a],fill='#0077aa',width=2);selected.append(f)
 for b in o.get('reference_banks',[]):
  x,y=px(b['lonlat']);d.ellipse((x-3,y-3,x+3,y+3),fill='#00aa55')
 d.line((480,500,520,500),fill='red',width=2);d.line((500,480,500,520),fill='red',width=2);d.rectangle((0,1000,1000,1040),fill='white');d.text((10,1006),ident+f' exact reference point; {span} ground-metre window; north up',fill='black');d.text((10,1022),'Original NSTDB water geometry. Red +: adopted point; green: bank endpoints when present.',fill='black');im.save(R/'observations'/(ident+'-reference-review.jpg'),quality=94);(R/'observations'/(ident+'-reference-features.geojson')).write_text(json.dumps({'type':'FeatureCollection','features':selected}))
