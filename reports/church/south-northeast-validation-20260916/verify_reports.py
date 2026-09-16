from pathlib import Path
import json,hashlib,subprocess,importlib.util
import numpy as np
from shapely.geometry import MultiPoint,Point
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.cutlines import Cutline
R=Path(__file__).resolve().parent;ROOT=R.parents[2];s=importlib.util.spec_from_file_location('score',R.parent/'target-refinement-20260913/score_models.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def compare(a,b):
 if isinstance(b,dict):
  for k,v in b.items():compare(a[k],v)
 elif isinstance(b,list):
  assert len(a)==len(b)
  for x,y in zip(a,b,strict=True):compare(x,y)
 elif isinstance(b,(int,float)):assert abs(a-b)<1e-5,(a,b)
 else:assert a==b,(a,b)
f=read(R/'freeze.json');commit=f['input_commit'];subprocess.run(['git','merge-base','--is-ancestor',commit,'origin/nightly'],check=True)
for v in f['inputs'].values():
 p=ROOT/v['path'];assert sha(p)==v['sha256'];assert p.read_bytes()==subprocess.check_output(['git','show',commit+':'+v['path']])
cs=load_gcps(R/'controls.csv');assert len(cs)==13;assert (R/'controls.csv').read_bytes()==(ROOT/f['inputs']['controls']['path']).read_bytes();assert sha(Path(f['raster']))==f['raster_sha256'];prior=[p for p in load_gcps(ROOT/f['inputs']['prior_inventory']['path']) if p.role=='check'];assert len(prior)==16
assert (R/'fresh-validation.csv').read_bytes().startswith((ROOT/f['inputs']['prior_inventory']['path']).read_bytes());base=load_gcps(ROOT/f['inputs']['baseline_controls']['path']);new=[];refs={};inside=[];count=0;hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in cs]).convex_hull;cutline=Cutline(tuple(map(tuple,read(R.parent/'south-distributed-refinement-20260915/content-boundary.json')['ring_pixel_xy'])))
for ident in ['IS50','IS51']:
 path=R/'observations'/(ident+'.json');o=read(path);fr=o['source_frame'];assert fr['rotation']==0;assert sha(Path(o['source_crop_path']))==o['source_crop_sha256'];xy=np.asarray(fr['origin'])+np.asarray(o['source_display_pixel_xy'])*np.asarray(fr['extent'])/np.asarray(fr['display']);assert np.allclose(xy,o['pixel_xy'],atol=1e-8,rtol=0);assert cutline.contains(*xy);assert read(ROOT/f['inputs']['selection_freeze']['path'])['frozen_at']<o['recorded_at']
 key=o['reference_path']
 if key not in refs:assert sha(Path(key))==o['reference_sha256'];refs[key]={v['properties']['OBJECTID']:v for v in read(Path(key))['features']}
 fs=refs[key]
 for q in o['reference_vertices']:
  assert fs[q['feature_id']]['geometry']['coordinates'][q['vertex']][:2]==o['lonlat'];assert fs[q['feature_id']]['properties']['FEAT_CODE']=='WARV50'
 assert len({q['feature_id'] for q in o['reference_vertices']})==(4 if ident=='IS50' else 3)
 for v in read(R/'observations'/(ident+'-reference-features.geojson'))['features']:assert v==fs[v['properties']['OBJECTID']]
 p=GroundControlPoint(*o['pixel_xy'],*o['lonlat'],'check',ident);new.append(p);first=read(R/(ident+'-first.json'));assert first['observation_sha256']==sha(path) and first['freeze_sha256']==sha(R/'freeze.json');assert first['scored_at']>=o['recorded_at'];assert first['inside_control_hull']==hull.covers(Point(*xy))
 if first['inside_control_hull']:inside.append(ident)
 compare(m.score(cs,[p],'tps'),first['physical_tps13']);compare(m.score(base,[p],'tps'),first['accepted_baseline_tps']);count+=2
assert load_gcps(R/'fresh-validation.csv')==cs+prior+new;assert load_gcps(R/'new-checks.csv')==cs+new;assert len({(p.lon,p.lat) for p in cs+prior+new})==31;assert inside==[]
a=read(R/'accuracy-summary.json');old=read(ROOT/f['inputs']['prior_accuracy']['path'])
for model,points,expected in [(cs,prior+new,a['physical_tps13']),(base,prior+new,a['accepted_baseline_tps']),(cs,new,a['new_pair_tps13']),(base,new,a['new_pair_baseline']),(cs,prior,old['physical_tps13']),(base,prior,old['accepted_baseline_tps'])]:compare(m.score(model,points,'tps'),expected);count+=1
w=read(R/'warped-review/receipt.json');assert w['raster_sha256']==f['raster_sha256'] and len(w['reviews'])==2
for v in w['reviews']:assert sha(R/'warped-review'/v['figure'])==v['figure_sha256'] and v['source_pixel_alpha']>0
for v in w['references']:assert sha(Path(v['path']))==v['sha256']
ov=read(R/'coverage-overview.json');assert sha(R/'coverage-overview.jpg')==ov['figure_sha256'] and ov['raster_sha256']==f['raster_sha256'] and len(ov['points'])==31
br=read(R/'browser-review.json');assert br['console_errors']==[] and br['raster_sha256']==f['raster_sha256']
for v in br['screenshots']+br['states']:assert sha(Path(v['path']))==v['sha256']
for ident in ['IS50','IS51']:
 text=next(Path(v['path']).read_text() for v in br['states'] if Path(v['path']).name==ident+'-import-state.txt');assert 'checkbox "inverness-south-tps13-review-20m" [checked]' in text
 text=next(Path(v['path']).read_text() for v in br['states'] if Path(v['path']).name==ident+'-terrain10x-state.txt');assert 'status: 10×' in text
for v in read(R/'import-verification.json')['results']:assert v['semanticRoundtrip'] and all(q['maxDifferenceProjectedMetres']<.001 for q in v['comparisons'])
status=read(R/'status.json');assert status['fresh_check_count']==18 and status['no_tuning_after_checks'] and not status['geographic_acceptance'];compare(status['physical_tps13'],a['physical_tps13'])
print(json.dumps(dict(metric_sets_replayed=count,new_physical_checks=2,fresh_checks=18,original_water_confluences_verified=True,inside_control_hull=inside,outside_control_hull=['IS50','IS51'],first_sixteen_and_frozen_fit_preserved=True,actual_raster_windows=2,editable_inventories=3,browser_terrain_verified=True,geographic_acceptance=False),indent=2))
