from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,math,numpy as np
r=Path('/Users/dfakkeldy/Downloads/church-south-western-coast-validation-20260916');names=json.loads((r/'headland-names.geojson').read_text());water=Path('/Users/dfakkeldy/Downloads/church-review-20260913/south-west-water-lines.geojson');roads=Path('/Users/dfakkeldy/Downloads/church-south-road-validation-20260915');font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',13)
for name,label in [('finlay','Finlay Point'),('green','Green Point'),('sight','Sight Point')]:
 q=next(f for f in names['features'] if f['properties']['county']=='Inverness' and f['properties']['geoname']==label and f['properties']['concise_ds']=='Cape');lon,lat=q['geometry']['coordinates'];c=math.cos(math.radians(lat));span=2400;im=Image.new('RGB',(1100,1140),'white');d=ImageDraw.Draw(im);selected=[];near=[]
 def px(p):return ((p[0]-lon)*111195*c/span*1100+550,550-(p[1]-lat)*111195/span*1100)
 for path,layer,color in [(water,4,'#0077aa'),(roads/'roads.geojson',8,'#c6a573')]:
  for f in json.loads(path.read_text())['features']:
   if f['geometry']['type']!='LineString':continue
   a=np.array(f['geometry']['coordinates']);lo=a.min(axis=0);hi=a.max(axis=0)
   if hi[0]<lon-span/2/111195/c or lo[0]>lon+span/2/111195/c or hi[1]<lat-span/2/111195 or lo[1]>lat+span/2/111195:continue
   d.line([px(p) for p in a],fill=color,width=2);selected.append({'layer':layer,'feature':f})
   if layer==4 and f['properties']['FEAT_CODE']=='WACO20':
    for i,v in enumerate(a):
     distance=math.hypot((v[0]-lon)*111195*c,(v[1]-lat)*111195)
     if distance<240:near.append({'feature_id':f['properties']['OBJECTID'],'vertex':i,'lonlat':list(v[:2]),'distance_from_name_m':distance})
 d.line((540,550,560,550),fill='#aa00aa',width=2);d.line((550,540,550,560),fill='#aa00aa',width=2);d.text((10,1107),label+' unscored context; 2400 ground metres, north up. Purple +: namepoint only.',fill='black',font=font);im.save(r/(name+'-reference.jpg'),quality=95);(r/(name+'-reference-context.json')).write_text(json.dumps(selected));(r/(name+'-coast-vertices.json')).write_text(json.dumps(near,indent=2));print(name,len(near),'original coast vertices near locality')
