from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from shapely.geometry import shape
import json,math,numpy as np
r=Path(__file__).resolve().parent;polys=json.loads((r/'buchanan-reference-polygons.json').read_text());p=polys[0];lon,lat=p['centroid'];span=2000;c=math.cos(math.radians(lat));im=Image.new('RGB',(1200,1240),'white');d=ImageDraw.Draw(im);font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',13)
def px(v):return ((v[0]-lon)*111195*c/span*1200+600,600-(v[1]-lat)*111195/span*1200)
fs=json.load(open('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson'))['features'];selected=[]
for f in fs:
 if f['geometry']['type']!='LineString':continue
 a=np.array(f['geometry']['coordinates']);lo=a.min(axis=0);hi=a.max(axis=0)
 if hi[0]<lon-span/2/111195/c or lo[0]>lon+span/2/111195/c or hi[1]<lat-span/2/111195 or lo[1]>lat+span/2/111195:continue
 d.line([px(q) for q in a],fill='#0077aa',width=2);selected.append(f)
for q in p['geometry']['coordinates']:d.line([px(v) for v in q],fill='#a60070',width=3)
d.line((588,600,612,600),fill='red',width=2);d.line((600,588,600,612),fill='red',width=2);d.text((10,1210),'Buchanan Lake original shoreline and candidate exterior centroid; 2000 ground metres, north up.',fill='black',font=font);im.save(r/'buchanan-reference.jpg',quality=95);(r/'buchanan-reference-context.geojson').write_text(json.dumps({'type':'FeatureCollection','features':selected}))
