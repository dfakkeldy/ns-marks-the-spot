"""Record six fresh physical observations against the already frozen eastern fit."""
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
FROZEN='a38b2074b7c5e525b684b02a8d848b7be6f8299bdcc53647afdb1dce09d800be'
assert hashlib.sha256((HERE/'frozen-fit.csv').read_bytes()).hexdigest()==FROZEN
sources=[Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson'),ROOT/'east-water-lines.geojson']
features={f['id']:f for p in sources for f in json.loads(p.read_text())['features']}
items=[
 dict(id='H01',label='Small coastal pond south of Marie Joseph Lakes',name='marie-south-native',origin=[30800,14000],size=[450,450],ids=[127338,127339],outline=[[13,176],[52,168],[99,173],[118,187],[144,213],[169,238],[191,240],[225,237],[246,226],[272,220],[291,226],[310,240],[332,245],[328,272],[306,279],[280,273],[253,266],[236,255],[213,250],[190,245],[166,245],[133,244],[113,241],[87,232],[62,216],[37,194]],uncertainty=130,evidence='Small coastal pond immediately south of the Marie Joseph Lakes complex and east of the isolated interior lake G04. The scan draws a western lobe joined to a small eastern basin containing an islet. Modern shoreline retains the same west-to-east connected basin and single eastern islet. Outer-basin centroid used; islet not a separate check.'),
 dict(id='H02',label='Capelin Cove western coastal lake',name='capelin-native',origin=[29300,14820],size=[510,360],ids=[124892,124893,124984],outline=[[48,247],[53,228],[72,210],[93,197],[118,192],[153,192],[137,180],[123,164],[130,148],[141,128],[155,109],[174,90],[192,79],[220,73],[244,67],[269,69],[290,75],[294,94],[292,108],[277,116],[266,125],[266,143],[279,166],[300,177],[321,181],[344,181],[359,191],[367,208],[362,222],[348,231],[325,231],[303,234],[280,230],[252,230],[227,234],[200,239],[169,249],[139,263],[112,274],[87,280],[68,275],[53,265]],uncertainty=130,evidence='Western lake behind the distinctive Capelin Cove headland, northwest of its separate smaller eastern pond. Three broad arms, lake/road/cove relation and the adjacent eastern pond distinguish this basin; historical arm outlines are generalized. Thin tributaries excluded.'),
 dict(id='H03',label='Small pond on southern Framboise peninsula',name='framboise-native',origin=[33080,12720],size=[380,280],ids=[127498,127499],outline=[[86,155],[116,143],[142,131],[163,108],[176,99],[202,88],[230,82],[250,71],[257,88],[263,110],[270,129],[271,139],[248,145],[223,150],[203,156],[179,160],[149,164],[124,170],[92,171]],uncertainty=150,evidence='Only isolated pond in the southern peninsula between the tidal Framboise/Fourchu channel and Framboise Cove, south of the road and Peebles Lake. The historical triangular basin is strongly generalized relative to the irregular modern basin; whole-basin definition and uncertainty retained.'),
 dict(id='H04',label='Long central island in Inhabitants Basin',name='eeman-native',origin=[6090,17760],size=[1140,480],ids=[16912,16913,16914,16915,16916,16917,17067,18368,18369,18372,19918,19919],outline=[[283,103],[300,89],[319,83],[330,100],[352,107],[376,101],[398,102],[418,112],[434,137],[440,149],[416,156],[403,152],[382,139],[365,142],[348,154],[337,174],[355,198],[375,225],[399,236],[432,243],[457,245],[478,250],[460,261],[450,269],[466,283],[493,279],[532,272],[527,250],[512,238],[503,232],[497,211],[495,190],[503,174],[521,157],[540,146],[557,160],[575,167],[599,161],[628,163],[661,175],[707,184],[752,192],[804,200],[842,207],[867,218],[913,224],[964,229],[1004,233],[1038,235],[1041,256],[1036,265],[1013,274],[980,281],[931,283],[898,281],[866,275],[840,273],[816,259],[790,246],[766,246],[742,249],[715,255],[688,261],[659,262],[642,276],[629,295],[617,325],[601,350],[589,374],[580,393],[555,391],[522,385],[497,374],[467,366],[438,363],[414,350],[390,341],[355,340],[313,338],[275,337],[247,344],[222,350],[207,365],[178,369],[160,370],[173,395],[143,400],[112,399],[86,404],[80,382],[75,359],[62,341],[43,333],[31,318],[36,305],[52,284],[65,267],[83,272],[98,288],[114,286],[135,273],[151,258],[178,252],[203,231],[231,215],[268,197],[301,179],[319,162],[305,147],[290,127]],uncertainty=110,evidence='Long central island immediately southeast of control F02 and east of diagnostic F03, with a northwestern hooked lobe, wide southwestern body and narrow eastward tail. All parts belong to the same closed modern island ring; small internal pond excluded from outer-outline centroid. A new feature but spatially correlated with the western controls/checks.'),
 dict(id='H05',label='Elongated islet southwest of Swen Island',name='southwest-islet-native',origin=[6050,18680],size=[450,190],ids=[22069,22070,22111,22112],outline=[[49,83],[62,75],[70,60],[88,61],[111,70],[135,68],[160,64],[181,72],[205,78],[232,79],[258,78],[280,73],[272,87],[265,100],[253,108],[237,117],[218,113],[203,108],[175,107],[148,110],[125,110],[100,105],[80,98],[61,95]],uncertainty=80,evidence='Separate elongated islet immediately southwest of the broad Swen Island and north of Rabbit Island; the row of three smaller northern/eastern islets corroborates identity. All small neighbouring rocks excluded. Same western basin locality, not additional regional coverage.'),
 dict(id='H06',label='Rabbit Island in Inhabitants Basin',name='rabbit-native',origin=[5750,18740],size=[1350,430],ids=[17824,19790,19826,19827,19828,22113,22114,22115,22149,22150,22151,23147],outline=[[72,223],[119,216],[166,200],[205,188],[254,177],[294,157],[322,155],[352,166],[382,171],[398,152],[419,131],[438,116],[459,116],[492,125],[521,131],[547,130],[583,121],[615,110],[655,98],[694,87],[725,84],[762,85],[810,96],[842,108],[882,117],[910,113],[927,111],[912,130],[894,145],[923,139],[952,128],[982,126],[1005,138],[1020,149],[1002,158],[968,160],[931,161],[898,175],[865,196],[839,184],[817,172],[795,171],[775,183],[753,203],[730,213],[708,223],[688,237],[659,247],[630,253],[606,260],[574,248],[547,230],[517,215],[494,206],[469,210],[452,228],[435,243],[413,251],[393,246],[372,236],[349,232],[332,237],[311,227],[292,220],[270,226],[237,232],[209,237],[173,242],[143,251],[110,258],[95,249],[81,234]],uncertainty=120,evidence='Long east-west Rabbit Island south of the Swen/islet group, with broad central bulge and two extended tips. The corresponding modern closed island ring preserves this position and structure. Engraved label excluded; small eastern rocks excluded. Same basin locality as H04/H05.')
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
manifest=dict(fit_sha256=FROZEN,status='Six observations selected and measured after ten-control fit freeze and before any new residual scores. No coordinate adjusted to predictions.',source_sha256='462194ca1ca810d88416d7cd344f17c5f37acf20c8e43381dc3064668010a5f7',reference_files=[dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in sources],points=obs,coverage='Three eastern basins and three western islands. The three western islands share one basin and are spatially correlated. Northern extension and southern Isle Madame have earlier diagnostic coverage only at this stage; northwest interior and southwestern mainland remain untested.',abstentions=['Marie Joseph upstream islands: historical two small islands and modern multiple marsh/river islands cannot be assigned confidently; not used.'])
(HERE/'fresh-checks.json').write_text(json.dumps(manifest,indent=2)+'\n')
with (HERE/'fresh-checks.csv').open('w',newline='') as f:
 w=csv.writer(f,lineterminator='\n');w.writerow(['pixel_x','pixel_y','lon','lat','role','label'])
 for p in obs:w.writerow([*p['pixel_xy'],*p['lonlat'],'check',p['id']])
print([(p['id'],p['pixel_xy'],p['lonlat']) for p in obs])
