"""Replay immutable checks, trial metrics, coordinate audits and selected raster receipts."""
import hashlib,json,re,subprocess,sys
from pathlib import Path
import numpy as np
from osgeo import gdal
from shapely.geometry import Polygon,Point,MultiPoint
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.landmarks import polygon_centroid
from tools.church.geometry import lonlat_to_mercator,mercator_to_lonlat
H=Path(__file__).resolve().parent
C=Path('/Users/dfakkeldy/Downloads/church-victoria-main-continuation-20260914')
sys.path.insert(0,str(H.parent/'target-refinement-20260913'))
from score_models import score
read=lambda p:json.loads(p.read_text())
def digest(p):
 with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def close(a,b):assert np.allclose(a,b,atol=1e-5,rtol=1e-9),(a,b)
def point(p,role='check'):return GroundControlPoint(*p['pixel_xy'],*p['lonlat'],role,p['id'])
base='da573d4ea3f479b2cafc0b79c26622522c32edc2'
subprocess.run(['git','merge-base','--is-ancestor',base,'origin/nightly'],check=True)
subprocess.run(['git','diff','--exit-code',base,'--','tools/church','reports/church/physical-review-20260912','reports/church/physical-review-20260913','reports/church/distributed-review-20260913','reports/church/victoria-northwest-continuation-20260914'],check=True)
points={};inventories=0
for p in H.rglob('*.csv'):
 rows=load_gcps(p);inventories+=1;controls=[q for q in rows if q.role=='control'];checks=[q for q in rows if q.role=='check']
 assert not {(q.lon,q.lat) for q in controls}&{(q.lon,q.lat) for q in checks},p
 for q in rows:
  if q.label in points:assert (q.pixel_x,q.pixel_y,q.lon,q.lat)==(points[q.label].pixel_x,points[q.label].pixel_y,points[q.label].lon,points[q.label].lat),(p,q)
  points[q.label]=q
old=read(H.parent/'physical-review-20260913/victoria-main/observations.json')['points']
old+=read(H.parent/'distributed-review-20260913/victoria-main/observations.json')['points']
for p in old:
 q=points[p['id']];assert (q.pixel_x,q.pixel_y,q.lon,q.lat)==(*p['pixel_xy'],*p['lonlat'])
observations=[read(p) for p in sorted((H/'observations').glob('VM*.json'))];refs={}
for p in observations:
 f=p['source_frame'];assert f['rotation']==0
 d=p['source_display_pixel_xy'] if 'source_display_pixel_xy' in p else polygon_centroid(p['source_outline_display_pixels'])[:2]
 close([f['origin'][i]+d[i]*f['extent'][i]/f['display'][i] for i in range(2)],p['pixel_xy'])
 assert digest(p['source_crop_path'])==p['source_crop_sha256']
 for key in ['identity_source_context','additional_source_context']:
  if key in p:assert digest(p[key]['path'])==p[key]['sha256']
 ref=Path(p['reference_path']);assert digest(ref)==p['reference_sha256']
 if ref not in refs:refs[ref]={f['id']:f for f in read(ref)['features']}
 fs=refs[ref]
 if 'reference_vertex' in p:
  v=p['reference_vertex'];assert fs[v['feature_id']]['geometry']['coordinates'][v['vertex']]==p['lonlat'],p['id']
  for v in p.get('shared_reference_vertices',[]):assert fs[v['feature_id']]['geometry']['coordinates'][v['vertex']]==p['lonlat']
 elif 'reference_mouth_midpoint' in p:
  xy=[]
  for v in p['reference_mouth_midpoint']['bank_vertices']:
   q=fs[v['feature_id']]['geometry']['coordinates'][v['vertex']];assert q==v['lonlat'];xy.append(lonlat_to_mercator(*q))
  close(mercator_to_lonlat(*np.mean(xy,axis=0)),p['lonlat'])
 else:
  ring=p['modern_ring'];vertices={tuple(q) for id in p['reference_feature_ids'] for q in fs[id]['geometry']['coordinates']};assert all(tuple(q) in vertices for q in ring)
  if 'reference_centroid_method' in p:
   origin=ring[0];shifted=[[q[0]-origin[0],q[1]-origin[1]] for q in ring];q=polygon_centroid(shifted)[:2];stable=[q[i]+origin[i] for i in range(2)];assert np.allclose(stable,p['lonlat'],rtol=0,atol=1e-12);assert np.allclose(stable,list(Polygon(ring).centroid.coords)[0],rtol=0,atol=1e-12)
  else:close(polygon_centroid(ring)[:2],p['lonlat'])
 points[p['id']]=point(p)
paths={4:'affine4-controls.csv',5:'northern-support-trial/controls.csv','5i':'interior-support-trial/interior-only-controls.csv',6:'interior-support-trial/controls.csv',7:'lake-support-trial/controls.csv',8:'baddeck-support-trial/controls.csv',11:'regional-tps11/controls.csv',12:'southern-support-trial/controls.csv',13:'southern-island-support/controls.csv',14:'central-river-support/controls.csv',15:'harbour-support/controls.csv','14c':'reference-correction/controls.csv'}
sets={n:load_gcps(H/p) for n,p in paths.items()}
for n,cs in sets.items():assert len(cs)==(14 if n=='14c' else 5 if n=='5i' else n) and all(p.role=='control' for p in cs)
for p in H.rglob('*freeze.json'):
 o=read(p);cp=H/'affine4-controls.csv' if p.name=='affine4-freeze.json' else p.parent/'controls.csv';key='control_csv_sha256' if 'control_csv_sha256' in o else 'controls_csv_sha256';assert digest(cp)==o[key];assert digest(H/'content-boundary.json')==o['boundary_sha256']
for p in H.rglob('VM*-first.json'):
 o=read(p);id=p.name.split('-')[0];assert digest(H/f'observations/{id}.json')==o['observation_sha256']
 freeze=H/'affine4-freeze.json' if p.parent==H else p.parent/'freeze.json';assert digest(freeze)==o['freeze_sha256']
words={'five':5,'six':6,'seven':7,'eight':8,'eleven':11,'twelve':12,'thirteen':13,'fourteen':14,'fifteen':15}
metrics=0
def walk(x,path,keys=()):
 global metrics
 if not isinstance(x,dict):return
 if 'rms_ground_m' in x and 'count' in x and 'points' in x:
  key='/'.join(keys);match=re.search(r'(affine|tps)(\d+)',key)
  if 'corrected14_' in key:n='14c'
  elif 'interior5' in key:n='5i'
  elif match:n=int(match.group(2))
  else:n=next((n for word,n in words.items() if word in key),6 if path.name=='polynomial2-comparison.json' else None)
  assert n in sets,(path,keys)
  method='polynomial2' if 'polynomial2' in key else 'tps' if 'tps' in key else 'affine'
  expected=score(sets[n],[points[p['label']] for p in x['points']],method)
  for k in ['rms_ground_m','median_ground_m','p95_ground_m','max_ground_m','mean_east_ground_m','mean_north_ground_m']:close(expected[k],x[k])
  for a,b in zip(expected['points'],x['points'],strict=True):
   assert a['label']==b['label'];close([a[k] for k in ['east_ground_m','north_ground_m','error_ground_m']],[b[k] for k in ['east_ground_m','north_ground_m','error_ground_m']])
  metrics+=1;return
 for k,v in x.items():walk(v,path,keys+(k,))
for p in H.rglob('*.json'):
 if p.parent.name not in ['observations','name-identity-audit','centroid-arithmetic-audit']:walk(read(p),p)
selected=sets['14c'];assert len({(p.lon,p.lat) for p in selected})==14
assert 'VM12' not in {p.label for p in selected}
for p in selected:
 q=points[p.label];assert (q.pixel_x,q.pixel_y,q.lon,q.lat)==(p.pixel_x,p.pixel_y,p.lon,p.lat)
fresh=load_gcps(H/'reference-correction/fresh-validation.csv');assert fresh[:14]==selected and [p.label for p in fresh[14:]]==['VM29']
assert [p.label for p in load_gcps(H/'reference-correction/diagnostic-review.csv')[14:]]==['VM21','VM22','VM24','VM25','VM27','VM28']
assert all(p.label not in {q.label for q in selected} for p in fresh[14:])
new=Polygon(read(H/'content-boundary.json')['ring_pixel_xy']);decision=read(H/'boundary-decision.json');old=Polygon(decision['old_production_ring']);assert new.is_valid;close(new.difference(old).area,decision['restored_native_px2']);close(old.difference(new).area,decision['removed_native_px2']);assert digest(H/'content-boundary.json')==decision['boundary_sha256']
# Interior of the independent Baddeck plan is excluded; border ink may remain.
assert not new.intersects(Polygon([(25150,25100),(33000,24950),(33000,30550),(25150,30550)]))
gdal.UseExceptions()
for folder,rpath,cpath in [('rendered','baseline-artifact-receipt.json','baseline-coverage.json'),('tps11-rendered','regional-tps11/artifact-receipt.json','regional-tps11/coverage.json'),('tps14-rendered','central-river-support/artifact-receipt.json','central-river-support/coverage.json'),('tps15-rendered','harbour-support/artifact-receipt.json','harbour-support/coverage.json'),('corrected-tps14-rendered','reference-correction/artifact-receipt.json','reference-correction/coverage.json')]:
 r=read(H/rpath);coverage=read(H/cpath);raster=C/folder/Path(r['output']).name;assert digest(raster)==r['output_sha256']==coverage['raster_sha256'];assert coverage['passed'] and coverage['transparent_interior_cells']==0
 ds=gdal.Open(str(raster));assert [ds.RasterXSize,ds.RasterYSize]==r['size'];close(ds.GetGeoTransform(),r['geotransform'])
 if 'orientation' in r:assert r['orientation']['nonnegative_determinants']==0
r=read(H/'reference-correction/artifact-receipt.json');assert r['controls_sha256']==digest(H/'reference-correction/controls.csv') and r['freeze_sha256']==digest(H/'reference-correction/freeze.json')
windows=read(H/'warped-review/receipt.json');assert windows['raster_sha256']==r['output_sha256']
for w in windows['reviews']:assert digest(H/'warped-review'/w['figure'])==w['figure_sha256'] and w['source_pixel_alpha']>0
revision=read(H/'observations/VM23.json')['centroid_revision'];assert digest(H/revision['original'])==revision['original_sha256'] and revision['source_pixel_and_ring_unchanged']
assert read(H/'VM08-identity-audit.json')['name_point_inside_original_reference_ring']
class_features={f['id']:f for ref in windows['references'] for f in read(Path(ref['path']))['features']}
legacy=read(H.parent/'physical-review-20260913/victoria-main/observations.json')['points']
for observation in legacy:
 if 'Island' not in observation['label']:continue
 exterior={tuple(q) for q in observation['modern_ring']}
 marine={tuple(q) for id in observation['reference_feature_ids'] if class_features[id]['properties']['FEAT_CODE'].startswith('WACOIS') for q in class_features[id]['geometry']['coordinates']}
 assert (exterior<=marine)==(observation['id']!='VM12')
wrong=points['VM12'];assert (wrong.lon,wrong.lat) not in {(p.lon,p.lat) for p in selected+fresh[14:]+load_gcps(H/'reference-correction/diagnostic-review.csv')[14:]}
print(json.dumps(dict(numerical_replays=metrics,new_observation_audits=len(observations),parsed_inventories=inventories,selected_controls=14,current_fresh_checks=1,current_diagnostics=6,actual_raster_windows=len(windows['reviews']),previous_inputs_unchanged=True,geographic_acceptance=False),indent=2))
