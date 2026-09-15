"""Replay regional trials, fresh checks and retained artifact evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import numpy as np
from shapely.geometry import MultiPoint, Point, Polygon
from tools.church.gcps import GroundControlPoint, load_gcps
from tools.church.cutlines import Cutline

R=Path(__file__).resolve().parent
OLD=R.parent/'cape-breton-northern-20260915'
BASE=R.parent/'cape-breton-continuation-20260915'
CACHE=Path('/Users/dfakkeldy/Downloads/church-cape-breton-regional-20260915')
spec=importlib.util.spec_from_file_location('score',R.parent/'target-refinement-20260913/score_models.py')
scorer=importlib.util.module_from_spec(spec);spec.loader.exec_module(scorer)
def read(p):return json.loads(p.read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def compare(a,b):
 if isinstance(b,dict):
  for k,v in b.items():compare(a[k],v)
 elif isinstance(b,list):
  assert len(a)==len(b)
  for x,y in zip(a,b,strict=True):compare(x,y)
 elif isinstance(b,(float,int)):assert abs(a-b)<1e-5,(a,b)
 else:assert a==b,(a,b)
def stable_centroid(ring):
 a=np.asarray(ring,dtype=float);origin=a[0].copy();a=a-origin
 if not np.array_equal(a[0],a[-1]):a=np.vstack([a,a[0]])
 cross=a[:-1,0]*a[1:,1]-a[1:,0]*a[:-1,1]
 return ((a[:-1]+a[1:])*cross[:,None]).sum(axis=0)/(3*cross.sum())+origin
base=load_gcps(BASE/'affine3-controls.csv');eight=load_gcps(OLD/'selected-tps8/controls.csv')
interior=load_gcps(R/'interior9/controls.csv');northwest=load_gcps(R/'northwest9/controls.csv')
ten=load_gcps(R/'combined10/controls.csv');eleven=load_gcps(R/'selected-tps11/controls.csv')
checks3=[p for p in load_gcps(R/'combined10/diagnostic-review.csv') if p.role=='check']
checks2=[p for p in load_gcps(R/'coastal11/diagnostic-review.csv') if p.role=='check']
assert [p.label for p in checks3]==['CB04','CB13','CB16']
assert [p.label for p in checks2]==['CB04','CB13']
assert [p.label for p in eleven]==['CB01','CB07','CB08','CB10','CB11','CB12','CB09','CB14','CB15','CB17','CB16']
count=0
for path,checks,rows in [
 ('model-comparison.json',checks3,[('tps8_same_three',eight,'tps'),('tps9_interior',interior,'tps'),('tps9_northwest',northwest,'tps'),('tps10',ten,'tps'),('affine10',ten,'affine')]),
 ('coastal11/model-comparison.json',checks2,[('tps10_same_two',ten,'tps'),('tps11',eleven,'tps'),('affine11',eleven,'affine')])]:
 expected=read(R/path)['models']
 for name,cs,method in rows:compare(scorer.score(cs,checks,method),expected[name]);count+=1
freeze=read(R/'selected-tps11/freeze.json')
subprocess.run(['git','merge-base','--is-ancestor',freeze['baseline_input_commit'],'origin/nightly'],check=True)
for name in ['CB15','CB16','CB17']:
 for p in [OLD/'observations'/f'{name}.json',OLD/f'{name}-first.json']:
  rel=p.relative_to(R.parents[2]);assert subprocess.check_output(['git','show',freeze['baseline_input_commit']+':'+str(rel)])==p.read_bytes()
reference_path=Path('/Users/dfakkeldy/Downloads/church-review-20260913/cape-water-lines.geojson')
reference={f['properties']['OBJECTID']:f for f in read(reference_path)['features']}
poly=Cutline(tuple(map(tuple,read(R/'content-boundary.json')['ring_pixel_xy'])))
fresh=[]
for name in ['CB18','CB19','CB20']:
 path=R/'observations'/f'{name}.json';p=read(path);frame=p['source_frame']
 assert frame['rotation']==0
 native=np.asarray(frame['origin'])+np.asarray(p['source_display_pixel_xy'])*np.asarray(frame['extent'])/np.asarray(frame['display'])
 assert np.allclose(native,p['pixel_xy'],atol=1e-8,rtol=0)
 assert poly.contains(*p['pixel_xy'])
 assert digest(Path(p['source_crop_path']))==p['source_crop_sha256']
 assert digest(reference_path)==p['reference_sha256']
 if name=='CB18':
  for v in p['reference_vertices']:assert reference[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2]==p['lonlat']
 else:
  outline=np.asarray(p['source_outline_display_pixels']);source=outline*np.asarray(frame['extent'])/np.asarray(frame['display'])+frame['origin']
  assert Polygon(source).is_valid
  assert np.allclose(Polygon(source).centroid.coords[0],p['pixel_xy'],atol=1e-8,rtol=0)
  assert np.allclose(stable_centroid(p['modern_ring']),p['lonlat'],atol=1e-12,rtol=0)
  assert np.allclose(Polygon(p['modern_ring']).centroid.coords[0],p['lonlat'],atol=1e-12,rtol=0)
  vertices=set()
  for fid in p['reference_feature_ids']:
   f=reference[fid];assert f['properties']['FEAT_CODE']=='WACOIS10';vertices.update(tuple(v[:2]) for v in f['geometry']['coordinates'])
  assert all(tuple(v) in vertices for v in p['modern_ring'])
 point=GroundControlPoint(*p['pixel_xy'],*p['lonlat'],'check',name);first=read(R/f'{name}-first.json')
 assert digest(path)==first['observation_sha256']
 assert digest(R/'selected-tps11/freeze.json')==first['freeze_sha256']
 assert freeze['frozen_at']<p['recorded_at']
 compare(scorer.score(eleven,[point],'tps'),first['tps11']);compare(scorer.score(base,[point],'affine'),first['baseline_affine3']);count+=2
 assert MultiPoint([(q.pixel_x,q.pixel_y) for q in eleven]).convex_hull.covers(Point(point.pixel_x,point.pixel_y))==first['inside_control_hull']
 fresh.append(point)
summary=read(R/'fresh-validation-summary.json')
compare(scorer.score(eleven,fresh,'tps'),summary['tps11']);compare(scorer.score(base,fresh,'affine'),summary['baseline_affine3']);count+=2
assert [p.label for p in load_gcps(R/'selected-tps11/fresh-validation.csv') if p.role=='check']==['CB18','CB19','CB20']
audit=read(R/'identity/stewarts-followup.json');assert audit['original_observation_sha256']==digest(R/'observations/CB18.json');assert audit['original_first_sha256']==digest(R/'CB18-first.json')
receipt=read(R/'selected-tps11/artifact-receipt.json');coverage=read(R/'selected-tps11/coverage.json')
assert digest(R/'selected-tps11/controls.csv')==freeze['controls_csv_sha256']==receipt['controls_sha256']
assert digest(R/'selected-tps11/freeze.json')==receipt['freeze_sha256']
assert (R/'content-boundary.json').read_bytes()==(OLD/'content-boundary.json').read_bytes()
assert digest(R/'content-boundary.json')==freeze['boundary_sha256']==receipt['boundary_sha256']
assert digest(CACHE/'rendered/cape-breton-tps11-review-20m.tif')==receipt['output_sha256']==coverage['raster_sha256']
assert coverage['transparent_interior_cells']==0 and receipt['orientation']['nonnegative_determinants']==0
for view in read(R/'warped-review/receipt.json')['reviews']:
 assert digest(R/'warped-review'/view['figure'])==view['figure_sha256'];assert view['source_pixel_alpha']>0
for shot in read(R/'browser-review.json')['screenshots']:assert digest(Path(shot['path']))==shot['sha256']
assert len(read(R/'import-verification.json')['results'])==10
assert read(R/'selected-tps11/embedded-import-verification.json')['embeddedMeshNodes']==81
assert not read(R/'status.json')['geographic_acceptance']
doc=R.parents[2]/'docs/CHURCH_MAPS.md'
for target in re.findall(r'\]\((\.\./reports/church/[^)]+)\)',doc.read_text()):assert (doc.parent/target).is_file(),target
print(json.dumps({'score_sets_replayed':count,'native_observation_audits':3,'fresh_checks':3,'actual_raster_windows':16,'editable_inventories':10,'report_index_links_checked':True,'geographic_acceptance':False},indent=2))
