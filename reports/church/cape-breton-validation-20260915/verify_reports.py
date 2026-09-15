"""Replay validation expansion without changing the frozen fit."""
import hashlib,importlib.util,json,subprocess
from pathlib import Path
import numpy as np
from shapely.geometry import MultiPoint,Point
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.cutlines import Cutline
R=Path(__file__).resolve().parent;OLD=R.parent/'cape-breton-regional-20260915'
s=importlib.util.spec_from_file_location('score',R.parent/'target-refinement-20260913/score_models.py');scorer=importlib.util.module_from_spec(s);s.loader.exec_module(scorer)
def read(p):return json.loads(p.read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def compare(a,b):
 if isinstance(b,dict):
  for k,v in b.items():compare(a[k],v)
 elif isinstance(b,list):
  assert len(a)==len(b)
  for x,y in zip(a,b,strict=True):compare(x,y)
 elif isinstance(b,(int,float)):assert abs(a-b)<1e-5,(a,b)
 else:assert a==b,(a,b)
manifest=read(R/'frozen-inputs.json');commit=manifest['input_commit']
subprocess.run(['git','merge-base','--is-ancestor',commit,'origin/nightly'],check=True)
for key in ['controls','fit_freeze']:
 p=R.parents[2]/manifest[key];assert digest(p)==manifest[key+'_sha256'];assert subprocess.check_output(['git','show',commit+':'+manifest[key]])==p.read_bytes()
assert (R/'controls.csv').read_bytes()==(OLD/'selected-tps11/controls.csv').read_bytes()
assert digest(Path(manifest['raster']))==manifest['raster_sha256']
for record in manifest['previous_fresh']:
 for field in ['first','observation']:
  path=R.parents[2]/record[field+'_path'];assert digest(path)==record[field+'_sha256'];assert subprocess.check_output(['git','show',commit+':'+record[field+'_path']])==path.read_bytes()
cs=load_gcps(R/'controls.csv');base=load_gcps(R.parent/'cape-breton-continuation-20260915/affine3-controls.csv')
assert len(cs)==11 and all(p.role=='control' for p in cs)
allpoints=load_gcps(R/'cumulative-fresh.csv');checks=[p for p in allpoints if p.role=='check'];assert [p.label for p in checks]==['CB18','CB19','CB20','CB21','CB22','CB23']
refpath=Path('/Users/dfakkeldy/Downloads/church-review-20260913/cape-water-lines.geojson');reference={f['properties']['OBJECTID']:f for f in read(refpath)['features']}
poly=Cutline(tuple(map(tuple,read(OLD/'content-boundary.json')['ring_pixel_xy'])))
freeze=read(OLD/'selected-tps11/freeze.json');count=0
for name in ['CB21','CB22','CB23']:
 path=R/'observations'/f'{name}.json';p=read(path);frame=p['source_frame'];assert frame['rotation']==0
 native=np.asarray(frame['origin'])+np.asarray(p['source_display_pixel_xy'])*np.asarray(frame['extent'])/np.asarray(frame['display'])
 assert np.allclose(native,p['pixel_xy'],rtol=0,atol=1e-9);assert poly.contains(*p['pixel_xy']);assert digest(Path(p['source_crop_path']))==p['source_crop_sha256'];assert digest(refpath)==p['reference_sha256']
 for v in p['reference_vertices']:assert reference[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2]==p['lonlat']
 assert freeze['frozen_at']<p['recorded_at']
 q=GroundControlPoint(*p['pixel_xy'],*p['lonlat'],'check',name);first=read(R/f'{name}-first.json')
 assert digest(path)==first['observation_sha256'];assert first['fit_freeze_sha256']==manifest['fit_freeze_sha256']
 compare(scorer.score(cs,[q],'tps'),first['tps11']);compare(scorer.score(base,[q],'affine'),first['baseline_affine3']);count+=2
 assert MultiPoint([(p.pixel_x,p.pixel_y) for p in cs]).convex_hull.covers(Point(q.pixel_x,q.pixel_y))==first['inside_control_hull']
for path,rows in [('accuracy-summary.json',[('cumulative_tps11',cs,checks,'tps'),('cumulative_baseline_affine3',base,checks,'affine'),('new_three_tps11',cs,checks[3:],'tps'),('new_three_baseline_affine3',base,checks[3:],'affine')]),('snapshots/five-check-replay.json',[('cumulative_tps11',cs,checks[:5],'tps'),('cumulative_baseline_affine3',base,checks[:5],'affine'),('new_two_tps11',cs,checks[3:5],'tps'),('new_two_baseline_affine3',base,checks[3:5],'affine')])]:
 expected=read(R/path)
 for name,controls,checkset,method in rows:compare(scorer.score(controls,checkset,method),expected[name]);count+=1
for p in ['new-checks.csv','cumulative-fresh.csv']:
 rows=load_gcps(R/p);assert [q for q in rows if q.role=='control']==cs
for view in read(R/'warped-review/receipt.json')['reviews']:
 assert digest(R/'warped-review'/view['figure'])==view['figure_sha256'];assert view['source_pixel_alpha']>0
for shot in read(R/'browser-review.json')['screenshots']:assert digest(Path(shot['path']))==shot['sha256']
assert len(read(R/'import-verification.json')['results'])==3
assert not read(R/'status.json')['geographic_acceptance']
assert 'cape-breton-validation-20260915/README.md' in (R.parents[2]/'docs/CHURCH_MAPS.md').read_text()
print(json.dumps({'metric_sets_replayed':count,'new_observations_audited':3,'fresh_check_count':6,'fit_and_raster_unchanged':True,'new_raster_windows':3,'editable_inventories':3,'geographic_acceptance':False},indent=2))
