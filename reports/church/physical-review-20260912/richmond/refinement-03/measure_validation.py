"""Record six fresh physical observations against the already frozen western fit."""
import csv,hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from shapely.geometry import LineString,Polygon
from shapely.ops import linemerge,nearest_points,transform
from tools.church.landmarks import polygon_centroid
from tools.church.geometry import lonlat_to_mercator,mercator_to_lonlat
HERE=Path(__file__).resolve().parent
ROOT=Path('/Users/dfakkeldy/Downloads/church-refinement-03')
FROZEN='5f69f487670fcb30835e2a7cb861f4eeab99c5c383e81ace1774deae72314f89'
assert hashlib.sha256((HERE/'frozen-fit.csv').read_bytes()).hexdigest()==FROZEN
sources=[Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson'),ROOT/'east-water-lines.geojson']
features={f['id']:f for p in sources for f in json.loads(p.read_text())['features']}
items=[
 dict(id='G01',label='Green Island south of Isle Madame',name='green-native',origin=[15050,22080],size=[520,380],ids=[18505,18506],outline=[[133,153],[188,146],[230,132],[284,102],[321,111],[346,128],[365,150],[376,174],[365,207],[327,215],[290,202],[256,198],[228,211],[189,208],[155,194],[137,184]],uncertainty=90,evidence='The large isolated island south-east of Isle Madame, carrying the Green Island light symbol; coastline and Crab Neck island order corroborate identity. Dashed historical shore is explicitly interpolated between visible strokes; small adjacent modern rocks excluded.'),
 dict(id='G02',label='Crab Neck Island off eastern Isle Madame',name='crab-native',origin=[14770,20670],size=[420,400],ids=[18575],outline=[[91,93],[109,90],[139,98],[161,112],[183,134],[195,150],[174,150],[148,140],[125,131],[109,120],[98,110]],uncertainty=60,evidence='Elongated separate island northeast of Flat Point and north of Green Island, adjacent to the engraved Crab Neck label. The small rock immediately to its southwest is excluded.'),
 dict(id='G03',label='Benacadie Pond southern tidal throat',name='benacadie-native',origin=[20050,4800],size=[650,850],ids=[13845,13952],point=[301.5,355],uncertainty=120,evidence='Narrow southern connection of the long north-south Benacadie Pond with Bras d’Or Lake, east of Grand Narrows. Source point is the middle of the two banks at the southern constriction, not text. Modern point is the midpoint of the minimum separation between the opposing mouth-bank lines. Estuary shape and bank-definition uncertainty retained.'),
 dict(id='G04',label='Interior lake southwest of Marie Joseph Lakes',name='inland-lake-native',origin=[30300,14000],size=[700,650],ids=[138285,138286],outline=[[77,169],[86,155],[94,130],[108,113],[125,98],[157,94],[181,90],[208,86],[233,95],[256,106],[276,116],[261,131],[240,152],[218,165],[208,171],[185,170],[175,186],[147,191],[127,195],[117,202],[101,191],[85,176]],uncertainty=100,evidence='Isolated leaf-shaped interior lake southwest of Marie Joseph Lakes and west of the smaller coastal pond. Shape, relative position, and northeast drainage agree. Thin outgoing strokes are excluded from the water-body centroid.'),
 dict(id='G05',label='Peebles Lake near Fourchu',name='peebles-native',origin=[33200,11700],size=[1000,650],ids=[124951,124952,124953,125055,125056,125057,125058,125059,125060,125061,125438,125439],outline=[[237,299],[252,281],[288,267],[315,259],[365,261],[420,265],[468,266],[517,247],[567,226],[623,220],[674,230],[730,242],[783,263],[825,285],[845,316],[850,348],[837,380],[830,409],[831,451],[844,483],[876,506],[922,525],[970,542],[950,549],[906,557],[834,557],[765,556],[682,556],[600,554],[541,551],[486,530],[437,522],[393,518],[373,531],[365,548],[365,535],[377,517],[395,507],[432,479],[470,449],[510,430],[557,419],[605,417],[650,422],[693,431],[735,443],[761,437],[772,425],[771,405],[748,380],[712,360],[656,350],[580,350],[504,349],[430,348],[365,348],[305,344],[270,333],[250,320],[237,299]],uncertainty=150,evidence='Distinctive U-shaped Peebles Lake around its long central peninsula immediately northwest of Fourchu. Whole outer lake boundary traced, excluding central land. Historical northwest shore is generalized and road/ink overlap adds placement uncertainty; no shoreline equality assumed.'),
 dict(id='G06',label='Coastal pond west of Hector Point',name='north-pond-native',origin=[15850,3410],size=[500,650],ids=[15424,15425,15426,15427,15428],outline=[[96,174],[99,153],[111,137],[134,125],[154,105],[167,98],[185,117],[199,121],[218,115],[240,124],[257,145],[270,170],[285,185],[304,199],[290,212],[263,218],[246,217],[239,240],[235,275],[235,305],[241,339],[242,354],[235,375],[232,391],[242,418],[249,445],[257,474],[251,486],[232,491],[213,497],[193,507],[174,523],[165,482],[158,467],[144,446],[136,421],[124,400],[115,393],[99,398],[89,405],[76,393],[69,377],[79,360],[88,350],[88,332],[90,311],[86,293],[95,278],[107,261],[118,240],[114,223],[105,202]],uncertainty=120,evidence='North-south coastal basin west of Hector Point/Grand Narrows, with a broad northern head and narrow southern end. The scan depicts a closed pond; modern coast has a narrow tidal opening. The 13 m modern opening is explicitly closed only for measuring basin centroid, with 120 m feature-definition uncertainty. Not treated as an island.')
]
obs=[];used=set()
for item in items:
 fs=[features[i] for i in item['ids']];lines=[LineString(f['geometry']['coordinates']) for f in fs]
 if 'point' in item:
  # Compare in a local east/north scale; use actual bank vertices/segments.
  lon0,lat0=np.mean(np.vstack([np.array(l.coords) for l in lines]),axis=0)
  c=np.cos(np.deg2rad(lat0)); scaled=[transform(lambda x,y:(np.asarray(x)*c,y),l) for l in lines]
  a,b=nearest_points(*scaled);modern=[(a.x+b.x)/(2*c),(a.y+b.y)/2];mx,my=item['point'];definition='Midpoint across the southern tidal throat';ring=None
 else:
  merged=linemerge(lines);assert merged.geom_type=='LineString',(item['id'],merged.geom_type)
  ring=list(merged.coords);closure=np.linalg.norm((np.array(ring[0])-ring[-1])*[np.cos(np.deg2rad(ring[0][1])),1])*111195
  assert closure<20,(item['id'],closure)
  if ring[0]!=ring[-1]:ring.append(ring[0])
  assert Polygon(item['outline']).is_valid,item['id']
  assert Polygon(ring).is_valid,item['id']
  modern=list(polygon_centroid(ring)[:2]);mx,my=polygon_centroid(item['outline'])[:2];definition='Shoelace centroid of independently traced source basin/island and complete reference ring'
 pixel=[mx+item['origin'][0],my+item['origin'][1]]
 im=Image.open(ROOT/(item['name']+'.jpg'));d=ImageDraw.Draw(im)
 if 'outline' in item:d.line([tuple(p) for p in item['outline']]+[tuple(item['outline'][0])],fill='#0077cc',width=2)
 d.line((mx-15,my,mx+15,my),fill='red',width=2);d.line((mx,my-15,mx,my+15),fill='red',width=2);im.save(HERE/(item['id']+'-native-review.jpg'),quality=92)
 # Independent reference plot in local longitude/latitude aspect, with all matched shoreline geometry.
 coords=np.vstack([np.array(l.coords) for l in lines]);span=np.ptp(coords,axis=0);lo=coords.min(axis=0)-span*.15;hi=coords.max(axis=0)+span*.15
 c=np.cos(np.deg2rad(modern[1]));sz=[900,max(300,round(900*(hi[1]-lo[1])/((hi[0]-lo[0])*c)))];sz[1]=min(sz[1],1400)
 def px(p):return ((np.asarray(p)-lo)/(hi-lo)*[sz[0],-sz[1]]+[0,sz[1]]).tolist()
 ri=Image.new('RGB',tuple(sz),'white');d=ImageDraw.Draw(ri)
 for l in lines:d.line([tuple(px(p)) for p in l.coords],fill='#0077aa',width=2)
 a,b=px(modern);d.line((a-16,b,a+16,b),fill='red',width=2);d.line((a,b-16,a,b+16),fill='red',width=2);ri.save(HERE/(item['id']+'-reference-review.jpg'),quality=92)
 obs.append(dict(id=item['id'],label=item['label'],role='check',pixel_xy=pixel,lonlat=modern,definition=definition,source_frame=dict(origin=item['origin'],extent=item['size'],display=item['size'],rotation=0),source_outline_crop_pixels=item.get('outline'),source_point_crop_pixels=item.get('point'),source_crop_sha256=hashlib.sha256((ROOT/(item['name']+'.jpg')).read_bytes()).hexdigest(),reference_feature_ids=item['ids'],modern_ring=ring,placement_uncertainty_ground_m=item['uncertainty'],identity_evidence=item['evidence'],modern_closure_ground_m=closure if ring else None))
 used.update(item['ids'])
(HERE/'validation-reference-features.geojson').write_text(json.dumps(dict(type='FeatureCollection',features=[features[i] for i in sorted(used)]),indent=2)+'\n')
manifest=dict(fit_sha256=FROZEN,status='Six observations selected and measured after eight-control fit freeze and before any new residual scores. No coordinate adjusted to predictions.',source_sha256='462194ca1ca810d88416d7cd344f17c5f37acf20c8e43381dc3064668010a5f7',reference_files=[dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in sources],points=obs,coverage='Two Grand Narrows-area observations, two Isle Madame observations, one eastern interior lake and one Fourchu lake. West/northwest interior and mainland southwestern extension remain untested by fresh checks. These six are regional coverage, not survey checkpoints.',abstentions=['Marie Joseph upstream islands: historical two small islands and modern multiple marsh/river islands cannot be assigned confidently; not used.'])
(HERE/'fresh-checks.json').write_text(json.dumps(manifest,indent=2)+'\n')
with (HERE/'fresh-checks.csv').open('w',newline='') as f:
 w=csv.writer(f,lineterminator='\n');w.writerow(['pixel_x','pixel_y','lon','lat','role','label'])
 for p in obs:w.writerow([*p['pixel_xy'],*p['lonlat'],'check',p['id']])
print([(p['id'],p['pixel_xy'],p['lonlat']) for p in obs])
