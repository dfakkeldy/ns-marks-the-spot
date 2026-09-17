"""Replay the new mouth midpoint and immutable preceding validation."""
from pathlib import Path
import hashlib,json,importlib.util,subprocess
import numpy as np
from shapely.geometry import MultiPoint,Point
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.cutlines import Cutline
R=Path(__file__).resolve().parent;ROOT=R.parents[2]
s=importlib.util.spec_from_file_location('score',R.parent/'target-refinement-20260913/score_models.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
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
cs=load_gcps(R/'controls.csv');assert len(cs)==13;assert (R/'controls.csv').read_bytes()==(ROOT/f['inputs']['controls']['path']).read_bytes();assert sha(Path(f['raster']))==f['raster_sha256']
prior_rows=load_gcps(ROOT/f['inputs']['prior_inventory']['path']);prior=[p for p in prior_rows if p.role=='check'];assert len(prior)==7;assert (R/'fresh-validation.csv').read_bytes().startswith((ROOT/f['inputs']['prior_inventory']['path']).read_bytes())
o=read(R/'observations/IS41.json');fr=o['source_frame'];assert fr['rotation']==0;assert sha(Path(o['source_crop_path']))==o['source_crop_sha256'];assert np.allclose(np.mean(o['source_banks_display_pixels'],axis=0),o['source_display_pixel_xy'],atol=1e-9,rtol=0);xy=np.asarray(fr['origin'])+np.asarray(o['source_display_pixel_xy'])*np.asarray(fr['extent'])/np.asarray(fr['display']);assert np.allclose(xy,o['pixel_xy'],atol=1e-9,rtol=0)
cutline=Cutline(tuple(map(tuple,read(R.parent/'south-distributed-refinement-20260915/content-boundary.json')['ring_pixel_xy'])));assert cutline.contains(*xy);assert read(ROOT/f['inputs']['selection_freeze']['path'])['frozen_at']<o['recorded_at']
ref=Path(o['reference_path']);assert sha(ref)==o['reference_sha256'];fs={p['properties']['OBJECTID']:p for p in read(ref)['features']};banks=[]
for v in o['reference_banks']:
 banks.append(v['lonlat']);q=v['river'];assert fs[q['feature_id']]['geometry']['coordinates'][q['vertex']][:2]==v['lonlat'];assert fs[q['feature_id']]['properties']['FEAT_CODE']=='WARV20'
 for q in v['lake']:
  assert fs[q['feature_id']]['geometry']['coordinates'][q['vertex']][:2]==v['lonlat'];assert fs[q['feature_id']]['properties']['FEAT_CODE']=='WALK20';assert fs[q['feature_id']]['properties']['ZVALUE']==57.4
assert np.allclose(np.mean(banks,axis=0),o['lonlat'],atol=1e-12,rtol=0)
p=GroundControlPoint(*o['pixel_xy'],*o['lonlat'],'check','IS41');assert load_gcps(R/'fresh-validation.csv')==cs+prior+[p];assert load_gcps(R/'new-check.csv')==cs+[p];assert not {(p.lon,p.lat)}&{(v.lon,v.lat) for v in cs+prior};assert p.label not in {v.label for v in cs+prior}
base=load_gcps(ROOT/f['inputs']['baseline_controls']['path']);first=read(R/'IS41-first.json');assert first['observation_sha256']==sha(R/'observations/IS41.json') and first['freeze_sha256']==sha(R/'freeze.json');assert first['scored_at']>=o['recorded_at'];assert first['inside_control_hull']==MultiPoint([(q.pixel_x,q.pixel_y) for q in cs]).convex_hull.covers(Point(*xy))
for result,points in [(first,[p]),(read(R/'accuracy-summary.json'),prior+[p]),(read(ROOT/f['inputs']['prior_accuracy']['path']),prior)]:
 compare(m.score(cs,points,'tps'),result['physical_tps13']);compare(m.score(base,points,'tps'),result['accepted_baseline_tps'])
w=read(R/'warped-review/receipt.json');assert len(w['reviews'])==1 and w['raster_sha256']==f['raster_sha256']
for v in w['reviews']:assert sha(R/'warped-review'/v['figure'])==v['figure_sha256'] and v['source_pixel_alpha']>0
for v in w['references']:assert sha(Path(v['path']))==v['sha256']
ov=read(R/'coverage-overview.json');assert sha(R/'coverage-overview.jpg')==ov['figure_sha256'] and ov['raster_sha256']==f['raster_sha256'] and len(ov['points'])==21
browser=read(R/'browser-review.json');assert browser['console_errors']==[] and browser['raster_sha256']==f['raster_sha256']
for v in browser['screenshots']+browser['states']:assert sha(Path(v['path']))==v['sha256']
state=next(Path(v['path']).read_text() for v in browser['states'] if Path(v['path']).name=='IS41-import-state.txt');assert 'checkbox "inverness-south-tps13-review-20m" [checked]' in state and '4,751×6,488' in state
state=next(Path(v['path']).read_text() for v in browser['states'] if Path(v['path']).name=='IS41-terrain10x-state.txt');assert 'status: 10×' in state
imports=read(R/'import-verification.json')['results'];assert len(imports)==3
for v in imports:assert v['semanticRoundtrip'] and all(q['maxDifferenceProjectedMetres']<.001 for q in v['comparisons'])
status=read(R/'status.json');assert status['fresh_check_count']==8 and status['no_tuning_after_checks'] and not status['geographic_acceptance'];compare(status['physical_tps13'],read(R/'accuracy-summary.json')['physical_tps13'])
print(json.dumps(dict(metric_sets_replayed=6,new_physical_check='IS41',fresh_checks=8,source_bank_midpoint_verified=True,original_reference_bank_transitions_verified=True,first_seven_and_frozen_fit_preserved=True,actual_raster_window_verified=True,editable_inventories=3,browser_2d_terrain_verified=True,geographic_acceptance=False),indent=2))
