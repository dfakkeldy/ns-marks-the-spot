from pathlib import Path
import json,subprocess,math
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.geometry import mercator_to_lonlat
r=Path('/Users/dfakkeldy/Downloads/church-south-extension-validation-20260916');cs=load_gcps(Path('reports/church/south-southern-validation-20260916/controls.csv'));out=subprocess.check_output(['gdaltransform','-tps',*build_gcp_arguments(cs)],input='22100 31360\n',text=True);ll=mercator_to_lonlat(*map(float,out.split()[:2]));lon,lat=ll;span=5000;c=math.cos(math.radians(lat));im=Image.new('RGB',(1400,1440),'white');d=ImageDraw.Draw(im);font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',14)
files=[(Path('/Users/dfakkeldy/Downloads/church-south-extension-validation-20260916/extension-water-lines.geojson'),4,'#0077aa'),(Path('/Users/dfakkeldy/Downloads/church-south-road-validation-20260915/roads.geojson'),8,'#bb9955'),(Path('/Users/dfakkeldy/Downloads/church-south-road-validation-20260915/highways.geojson'),7,'#444444')];selected=[]
def px(p):return ((p[0]-lon)*111195*c/span*1400+700,700-(p[1]-lat)*111195/span*1400)
for path,layer,color in files:
 for f in json.loads(path.read_text())['features']:
  if f['geometry']['type']!='LineString':continue
  a=np.array(f['geometry']['coordinates']);lo=a.min(axis=0);hi=a.max(axis=0)
  if hi[0]<lon-span/2/111195/c or lo[0]>lon+span/2/111195/c or hi[1]<lat-span/2/111195 or lo[1]>lat+span/2/111195:continue
  d.line([px(q) for q in a],fill=color,width=2);selected.append({'path':str(path),'layer':layer,'feature':f});label=f['properties'].get('RIVNAME_1',f['properties'].get('STREET','')).strip()
  if label and label not in ['Track','Driveway','Trail','Dryweather']:d.text(px(a[len(a)//2]),label,fill=color,font=font)
d.line((685,700,715,700),fill='red',width=2);d.line((700,685,700,715),fill='red',width=2);d.text((10,1410),'Unscored reference search around source McIntyre Lake guide; 5000 ground metres; north up.',fill='black',font=font);im.save(r/'mcintyre-reference-filled.jpg',quality=95);(r/'mcintyre-reference-filled-context.json').write_text(json.dumps(selected));(r/'mcintyre-search-guide.json').write_text(json.dumps({'pixel_xy':[22100,31360],'predicted_lonlat':ll,'role':'search only, not an observation'},indent=2));print(ll)
