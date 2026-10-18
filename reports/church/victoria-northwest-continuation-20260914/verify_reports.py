"""Replay phase metrics, observation coordinates, role separation and rendered evidence."""
import hashlib,json,math,re,subprocess,sys
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon
from osgeo import gdal
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.landmarks import polygon_centroid
from tools.church.geometry import lonlat_to_mercator,mercator_to_lonlat
H=Path(__file__).resolve().parent
C=Path('/Users/dfakkeldy/Downloads/church-victoria-nw-continuation-20260914')
sys.path.insert(0,str(H.parent/'target-refinement-20260913'))
from score_models import score
read=lambda p:json.loads(p.read_text())
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def close(a,b):assert np.allclose(a,b,atol=1e-5,rtol=1e-9),(a,b)
def gp(p,role='check'):return GroundControlPoint(*p['pixel_xy'],*p['lonlat'],role,p['id'])
base=read(H/'affine4-freeze.json')['frozen_input_commit']
subprocess.run(['git','merge-base','--is-ancestor',base,'origin/nightly'],check=True)
subprocess.run(['git','diff','--exit-code',base,'--','tools/church','reports/church/physical-review-20260912','reports/church/physical-review-20260913','reports/church/distributed-review-20260913','reports/church/target-refinement-20260913'],check=True)
points={};csv_count=0
for p in H.rglob('*.csv'):
 rows=load_gcps(p);csv_count+=1
 controls=[q for q in rows if q.role=='control'];checks=[q for q in rows if q.role=='check']
 assert not {(q.lon,q.lat) for q in controls}&{(q.lon,q.lat) for q in checks},p
 for q in rows:
  if q.label in points:assert (q.pixel_x,q.pixel_y,q.lon,q.lat)==(points[q.label].pixel_x,points[q.label].pixel_y,points[q.label].lon,points[q.label].lat),(p,q)
  points[q.label]=q
observations=[read(p) for p in sorted((H/'observations').glob('VN*.json'))]+read(H/'north-pond-audit/observations.json')['points'];refs={}
for p in observations:
 f=p['source_frame'];assert f['rotation']==0
 if 'source_display_pixel_xy' in p:d=p['source_display_pixel_xy']
 else:d=polygon_centroid(p['source_outline_display_pixels'])[:2]
 xy=[f['origin'][i]+d[i]*f['extent'][i]/f['display'][i] for i in range(2)];close(xy,p['pixel_xy'])
 crop=Path(p['source_crop_path']);assert digest(crop)==p['source_crop_sha256'],crop
 ref=Path(p['reference_path']);assert digest(ref)==p['reference_sha256'],ref
 if ref not in refs:refs[ref]={x['id']:x for x in read(ref)['features']}
 fs=refs[ref]
 if 'reference_vertex' in p:
  v=p['reference_vertex'];assert fs[v['feature_id']]['geometry']['coordinates'][v['vertex']]==p['lonlat'],p['id']
 elif 'reference_mouth_midpoint' in p:
  vs=p['reference_mouth_midpoint']['bank_vertices'];xy=[]
  for v in vs:
   q=fs[v['feature_id']]['geometry']['coordinates'][v['vertex']];assert q==v['lonlat'];xy.append(lonlat_to_mercator(*q))
  close(mercator_to_lonlat(*np.mean(xy,axis=0)),p['lonlat'])
 else:
  ring=p['modern_ring'];original={tuple(q) for id in p['reference_feature_ids'] for q in fs[id]['geometry']['coordinates']};assert all(tuple(q) in original for q in ring)
  close(polygon_centroid(ring)[:2],p['lonlat'])
 points[p['id']]=gp(p)
for p in read(H/'north-pond-audit/observations.json')['points']:
 points[p['alias']]=GroundControlPoint(*p['original_pixel_xy'],*p['original_lonlat'],'check',p['alias'])
control_paths={4:H/'affine4-controls.csv',7:H/'distributed-trial/controls.csv',8:H/'interior-trial/controls.csv',9:H/'edge-and-interior-trial/controls.csv',10:H/'western-repair/controls.csv',11:H/'north-pond-support/controls.csv',14:H/'regional-support/controls.csv',15:H/'southwestern-support/controls.csv'}
sets={n:load_gcps(p) for n,p in control_paths.items()}
for n,cs in sets.items():assert len(cs)==n and all(p.role=='control' for p in cs)
for f in H.rglob('*freeze.json'):
 o=read(f);p=f.parent/'controls.csv' if f.name=='freeze.json' else H/'affine4-controls.csv';k=next(k for k in ['controls_csv_sha256','control_csv_sha256'] if k in o);assert digest(p)==o[k]
for p in H.rglob('*first*.json'):
 o=read(p)
 if 'observation_sha256' in o:
  id=p.name.split('-')[0];assert digest(H/f'observations/{id}.json')==o['observation_sha256']
metrics=0
words={'seven':7,'eight':8,'nine':9,'ten':10,'eleven':11}
def walk(x,path,keys=()):
 global metrics
 if not isinstance(x,dict):return
 if 'rms_ground_m' in x and 'count' in x and 'points' in x:
  key='/'.join(keys);m=re.search(r'(affine|tps)(\d+)',key)
  if m:method,n=m.group(1),int(m.group(2))
  else:
   method='polynomial2' if 'polynomial2' in key else 'tps' if 'tps' in key or (not keys and path.parent.name=='southwestern-support') else 'affine';n=next((n for w,n in words.items() if w in key),15 if path.parent.name=='southwestern-support' else 4)
  if path.name=='prospective-control-assessment.json':n,method=14,'tps'
  cs=sets[n]
  if path.parent.name=='western-corridor-trial' and n==11:cs=load_gcps(path.parent/'controls.csv')
  try:expected=score(cs,[points[p['label']] for p in x['points']],method)
  except Exception as error:raise AssertionError((str(path),keys,n,method)) from error
  for k in ['rms_ground_m','median_ground_m','p95_ground_m','max_ground_m','mean_east_ground_m','mean_north_ground_m']:close(expected[k],x[k])
  for a,b in zip(expected['points'],x['points'],strict=True):
   assert a['label']==b['label'];close([a[k] for k in ['east_ground_m','north_ground_m','error_ground_m']],[b[k] for k in ['east_ground_m','north_ground_m','error_ground_m']])
  metrics+=1;return
 for k,v in x.items():walk(v,path,keys+(k,))
for p in H.rglob('*.json'):
 if p.parent.name not in ['observations','browser-review','name-identity-audit']:walk(read(p),p)
selected=sets[15];assert len({(p.lon,p.lat) for p in selected})==15
for n in ['VN08','VN12','VN13','VN15','VN14','VN18','VN16','VN20','VN21','VN22','VN23']:
 assert next(p for p in selected if p.label==n)==gp(next(p for p in observations if p['id']==n),'control') if n!='VN08' else True
fresh=load_gcps(H/'southwestern-support/fresh-validation.csv');assert fresh[:15]==selected and [p.label for p in fresh[15:]]==['VN25','VN26']
assert not {'supply-04','VN16','VN10'}&{p.label for p in fresh[15:]}
new=Polygon(read(H/'content-boundary.json')['ring_pixel_xy']);old=Polygon(read(H/'old-boundary.json')['ring_pixel_xy']);audit=read(H/'boundary-audit.json');close(new.difference(old).area,audit['restored_native_px2']);close(old.difference(new).area,audit['removed_native_px2'])
assert new.is_valid and not new.intersects(Polygon([(500,3280),(3740,3280),(3740,7225),(500,7225)]))
r=read(H/'southwestern-support/artifact-receipt.json');raster=C/'tps15-rendered'/Path(r['output']).name;assert digest(raster)==r['output_sha256'];assert digest(H/'southwestern-support/controls.csv')==r['controls_sha256'];assert digest(H/'southwestern-support/freeze.json')==r['freeze_sha256']
gdal.UseExceptions();ds=gdal.Open(str(raster));assert [ds.RasterXSize,ds.RasterYSize]==r['size'];close(ds.GetGeoTransform(),r['geotransform']);assert r['orientation']['nonnegative_determinants']==0
coverage=read(H/'southwestern-support/coverage.json');assert coverage['passed'] and coverage['transparent_interior_cells']==0 and coverage['raster_sha256']==r['output_sha256']
for folder in ['tps11-warped-review','tps15-warped-review']:
 for w in read(H/folder/'receipt.json')['reviews']:assert digest(H/folder/w['figure'])==w['figure_sha256'] and w['source_pixel_alpha']>0
print(json.dumps(dict(numerical_replays=metrics,observation_audits=len(observations),parsed_inventories=csv_count,selected_controls=15,fresh_checks=2,previous_inputs_unchanged=True,raster_alpha_holes=0,geographic_acceptance=False),indent=2))
