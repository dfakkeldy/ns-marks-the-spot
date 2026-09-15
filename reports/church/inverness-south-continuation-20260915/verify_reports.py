"""Replay first scores, explicit trial phases and immutable baseline evidence."""
import hashlib,importlib.util,json,subprocess
from pathlib import Path
import numpy as np
from shapely.geometry import MultiPoint,Point
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.cutlines import Cutline
R=Path(__file__).resolve().parent;ROOT=R.parents[2];O=R.parent/'physical-review-20260913/inverness-south';D=R.parent/'distributed-review-20260913/inverness-south'
s=importlib.util.spec_from_file_location('score',R.parent/'target-refinement-20260913/score_models.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
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
frozen=read(R/'frozen-inputs.json');commit=frozen['input_commit'];subprocess.run(['git','merge-base','--is-ancestor',commit,'origin/nightly'],check=True)
for rec in frozen['inputs']:
 p=ROOT/rec['path'];assert digest(p)==rec['sha256'];assert subprocess.check_output(['git','show',commit+':'+rec['path']])==p.read_bytes()
assert digest(Path(frozen['raster']))==frozen['raster_sha256']
cs=load_gcps(R/'controls.csv');assert cs==[p for p in load_gcps(O/'physical-trial.csv') if p.role=='control'];base=load_gcps(ROOT/'tools/church/gcps/inverness-south.csv');hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in cs]).convex_hull;cutline=Cutline(tuple(map(tuple,read(O/'final-artifact-receipt.json')['source_cutline'])))
checks=[p for p in load_gcps(R/'cumulative-fresh.csv') if p.role=='check'];assert [p.label for p in checks]==['IS15','IS18','IS19'];assert checks[:1]==load_gcps(O/'fresh-check.csv');count=0
for name in ['IS18','IS19']:
 path=R/'observations'/f'{name}.json';o=read(path);f=o['source_frame'];native=np.asarray(f['origin'])+np.asarray(o['source_display_pixel_xy'])*np.asarray(f['extent'])/np.asarray(f['display']);assert f['rotation']==0;assert np.allclose(native,o['pixel_xy'],rtol=0,atol=1e-9);assert cutline.contains(*o['pixel_xy']);assert digest(Path(o['source_crop_path']))==o['source_crop_sha256'];refs=Path(o['reference_path']);assert digest(refs)==o['reference_sha256'];features={p['properties']['OBJECTID']:p for p in read(refs)['features']}
 for v in o['reference_vertices']:assert features[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2]==o['lonlat']
 p=GroundControlPoint(*o['pixel_xy'],*o['lonlat'],'check',name);assert p==next(q for q in checks if q.label==name);first=read(R/f'{name}-first.json');assert digest(path)==first['observation_sha256'];assert digest(O/'physical-trial.csv')==first['frozen_fit_sha256'];assert first['inside_control_hull']==hull.covers(Point(p.pixel_x,p.pixel_y));compare(m.score(cs,[p],'affine'),first['physical_affine']);compare(m.score(base,[p],'tps'),first['accepted_baseline_tps']);count+=2
summary=read(R/'accuracy-summary.json')
for phase,rows in [('cumulative',checks),('new_two',checks[1:])]:
 for name,controls,method in [('physical_affine',cs,'affine'),('accepted_baseline_tps',base,'tps')]:compare(m.score(controls,rows,method),summary[phase+'_'+name]);count+=1
historical=[p for p in load_gcps(D/'audited-diagnostic-review.csv') if p.role=='check'];assert len(historical)==6
for folder,ncontrols,promoted in [('skye-refinement',5,['IS18']),('skye-refinement/six-distributed',6,['IS18','IS19']),('skye-refinement/seven-distributed',7,['IS18','IS19','IS15'])]:
 p=R/folder;rows=load_gcps(p/'diagnostic-review.csv');controls=[q for q in rows if q.role=='control'];remaining=[q for q in rows if q.role=='check'];assert len(controls)==ncontrols;assert controls==load_gcps(p/'controls.csv');assert remaining==historical+[q for q in checks if q.label not in promoted]
 for name in promoted:
  q=next(q for q in checks if q.label==name);v=next(v for v in controls if v.label==name);assert (q.pixel_x,q.pixel_y,q.lon,q.lat)==(v.pixel_x,v.pixel_y,v.lon,v.lat);assert not any((w.lon,w.lat)==(q.lon,q.lat) for w in remaining)
 expected=read(p/'comparison.json')['models'];names=['frozen-affine4','affine5-skye','tps5-skye'] if ncontrols==5 else ['frozen-affine4','new-affine','new-tps']
 for name,c,method in zip(names,[cs,controls,controls],['affine','affine','tps'],strict=True):
  sets=[('all_eight_diagnostics',remaining),('six_historical',historical),('two_recent',remaining[6:])] if ncontrols==5 else [('same_remaining_diagnostics',remaining),('six_historical',historical)]
  for label,points in sets:compare(m.score(c,points,method),expected[name][label]);count+=1
for view in read(R/'warped-review/receipt.json')['reviews']:assert digest(R/'warped-review'/view['figure'])==view['figure_sha256'];assert view['source_pixel_alpha']>0
for record in read(R/'browser-review.json')['screenshots']+read(R/'browser-review.json')['states']:assert digest(Path(record['path']))==record['sha256']
assert len(read(R/'import-verification.json')['results'])==6
assert read(R/'role-history.json')['fresh_checks_after_selection']==0
assert not read(R/'status.json')['geographic_acceptance']
print(json.dumps(dict(metric_sets_replayed=count,new_observations_audited=2,first_validation_checks=3,post_selection_fresh_checks=0,explicit_refinement_trials=6,retained_affine_and_raster_unchanged=True,accepted_baseline_inputs_unchanged=True,actual_raster_windows=2,editable_inventories=6,geographic_acceptance=False),indent=2))
