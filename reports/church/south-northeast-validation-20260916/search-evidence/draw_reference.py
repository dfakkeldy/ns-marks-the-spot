from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,math,numpy as np
r=Path('/Users/dfakkeldy/Downloads/church-south-northeast-validation-20260916');rows=json.loads((r/'named-junction-search.json').read_text());water=Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson');roads=Path('/Users/dfakkeldy/Downloads/church-south-road-validation-20260915');font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',13)
for name,index in [('nile',3),('ingram',5)]:
 q=rows[index];lon,lat=q['lonlat'];span=3800;c=math.cos(math.radians(lat));im=Image.new('RGB',(1200,1240),'white');d=ImageDraw.Draw(im);selected=[]
 def px(p):return ((p[0]-lon)*111195*c/span*1200+600,600-(p[1]-lat)*111195/span*1200)
 for path,layer,color in [(water,4,'#0077aa'),(roads/'roads.geojson',8,'#c99966'),(roads/'highways.geojson',7,'#444444')]:
  for f in json.loads(path.read_text())['features']:
   if f['geometry']['type']!='LineString':continue
   a=np.array(f['geometry']['coordinates']);lo=a.min(axis=0);hi=a.max(axis=0)
   if hi[0]<lon-span/2/111195/c or lo[0]>lon+span/2/111195/c or hi[1]<lat-span/2/111195 or lo[1]>lat+span/2/111195:continue
   d.line([px(p) for p in a],fill=color,width=2);selected.append({'layer':layer,'feature':f})
   label=f['properties'].get('RIVNAME_1',f['properties'].get('STREET','')).strip()
   if label and label not in ['Track','Driveway','Trail','Dryweather']:
    p=px(a[len(a)//2]);d.text(p,label,fill=color,font=font)
 d.line((585,600,615,600),fill='red',width=2);d.line((600,585,600,615),fill='red',width=2);d.text((10,1205),name+' unscored reference search: 3800 ground metres, north up. Red + candidate junction.',fill='black',font=font);im.save(r/(name+'-reference.jpg'),quality=94);(r/(name+'-reference-context.json')).write_text(json.dumps(selected))
