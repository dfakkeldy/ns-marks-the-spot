from pathlib import Path
import json,math
from PIL import Image,ImageDraw
C=Path(__file__).parent
fs=json.loads(Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson').read_text())['features']
lon,lat=-61.15695,46.00548;span=6500;c=math.cos(math.radians(lat));im=Image.new('RGB',(1400,1400),'white');d=ImageDraw.Draw(im)
def px(v):return (700+(v[0]-lon)*111195*c/span*1400,700-(v[1]-lat)*111195/span*1400)
colors={'Skye River':'#0080bb','Ainslie Glen Brook':'#db6500','Mullach Brook':'#8e3ba1','MacDonalds Brook':'#158947'}
for f in fs:
 if f['geometry']['type']!='LineString':continue
 cs=f['geometry']['coordinates'];p=[px(v) for v in cs]
 if max(v[0] for v in p)<0 or min(v[0] for v in p)>1400 or max(v[1] for v in p)<0 or min(v[1] for v in p)>1400:continue
 n=f['properties']['RIVNAME_1'].strip();d.line(p,fill=colors.get(n,'#b9c5c9'),width=3 if n in colors else 1)
for i,(n,col) in enumerate(colors.items()):d.text((10,20+i*22),n,fill=col)
for name,xy in [('A: Ainslie Glen / Skye',[-61.15695012726067,46.00547877443053]),('B: Mullach / Ainslie Glen',[-61.14697976419124,46.00990235179478]),('C: MacDonalds / Skye',[-61.158974882430165,46.01028077834285])]:
 x,y=px(xy);d.ellipse((x-6,y-6,x+6,y+6),outline='red',width=2);d.text((x+9,y+9),name,fill='black')
im.save(C/'skye-network.jpg',quality=92)
