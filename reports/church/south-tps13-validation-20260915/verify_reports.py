"""Replay first validation against frozen TPS13 and audit original geometry."""
from pathlib import Path
import hashlib,importlib.util,json,subprocess
import numpy as np
from shapely.geometry import Polygon,MultiPoint,Point
from tools.church.gcps import load_gcps,GroundControlPoint
from tools.church.cutlines import Cutline
R=Path(__file__).resolve().parent;ROOT=R.parents[2];PREV=R.parent/'south-distributed-refinement-20260915'
s=importlib.util.spec_from_file_location('score',R.parent/'target-refinement-20260913/score_models.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def compare(a,b):
 if isinstance(b,dict):
  for k,v in b.items():compare(a[k],v)
 elif isinstance(b,list):
  assert len(a)==len(b)
  for x,y in zip(a,b,strict=True):compare(x,y)
 elif isinstance(b,(float,int)):assert abs(a-b)<1e-5,(a,b)
 else:assert a==b,(a,b)
f=read(R/'freeze.json');commit=f['input_commit'];subprocess.run(['git','merge-base','--is-ancestor',commit,'origin/nightly'],check=True)
for path,key in [('controls_path','controls_sha256'),('selected_freeze_path','selected_freeze_sha256')]:
 p=ROOT/f[path];assert sha(p)==f[key];assert p.read_bytes()==subprocess.check_output(['git','show',commit+':'+f[path]])
assert (R/'controls.csv').read_bytes()==(ROOT/f['controls_path']).read_bytes();assert sha(Path(f['raster']))==f['raster_sha256'];assert f['method']=='tps'
for v in read(R.parent/'south-validation-20260915/baseline-inputs.json')['inputs']:
 p=ROOT/v['path'];assert sha(p)==v['sha256'];assert p.read_bytes()==subprocess.check_output(['git','show',commit+':'+v['path']])
cs=load_gcps(R/'controls.csv');base=load_gcps(ROOT/'tools/church/gcps/inverness-south.csv');rows=load_gcps(R/'fresh-validation.csv');assert [p for p in rows if p.role=='control']==cs;checks=[p for p in rows if p.role=='check'];assert [p.label for p in checks]==['IS34','IS35','IS36'];assert len(cs)==13
previous=load_gcps(ROOT/f['prior_selection_inventory'])+load_gcps(ROOT/'tools/church/checks/inverness-south.csv');assert not {p.label for p in checks}&{p.label for p in previous};assert not {(p.lon,p.lat) for p in checks}&{(p.lon,p.lat) for p in previous}
hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in cs]).convex_hull;cutline=Cutline(tuple(map(tuple,read(PREV/'content-boundary.json')['ring_pixel_xy'])));refs={};inside=[];metric_sets=0
for p in checks:
 path=R/'observations'/(p.label+'.json');o=read(path);fr=o['source_frame'];assert fr['rotation']==0;assert f['selected_frozen_at']<o['recorded_at'];native=np.asarray(fr['origin'])+np.asarray(o['source_display_pixel_xy'])*np.asarray(fr['extent'])/np.asarray(fr['display']);assert np.allclose(native,o['pixel_xy'],atol=1e-8,rtol=0);assert cutline.contains(*native);assert sha(Path(o['source_crop_path']))==o['source_crop_sha256'];assert p==GroundControlPoint(*o['pixel_xy'],*o['lonlat'],'check',o['id'])
 key=o['reference_path']
 if key not in refs:
  assert sha(Path(key))==o['reference_sha256'];refs[key]={v['properties']['OBJECTID']:v for v in read(Path(key))['features']}
 features=refs[key]
 if 'modern_ring' in o:
  for name,point in [('source_outline_display_pixels','source_display_pixel_xy'),('modern_ring','lonlat')]:
   ring=np.asarray(o[name]);origin=ring.mean(axis=0);poly=Polygon(ring-origin);assert poly.is_valid;cent=np.asarray(poly.centroid.coords[0])+origin;assert np.allclose(cent,o[point],atol=1e-8,rtol=0)
  ring=[tuple(v) for v in o['modern_ring']];edges={frozenset((a,b)) for a,b in zip(ring,ring[1:])};original=set()
  for fid in o['reference_feature_ids']:
   v=features[fid];assert v['properties']['FEAT_CODE']==o['reference_feature_code'];a=[tuple(q[:2]) for q in v['geometry']['coordinates']];original.update(frozenset((x,y)) for x,y in zip(a,a[1:]))
  assert edges<=original
 else:
  for v in o['reference_vertices']:assert features[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2]==o['lonlat']
 for v in read(R/'observations'/(p.label+'-reference-features.geojson'))['features']:assert v==features[v['properties']['OBJECTID']]
 first=read(R/(p.label+'-first.json'));assert first['observation_sha256']==sha(path);assert first['freeze_sha256']==sha(R/'freeze.json');assert first['scored_at']>=o['recorded_at'];assert first['inside_control_hull']==hull.covers(Point(p.pixel_x,p.pixel_y))
 if first['inside_control_hull']:inside.append(p.label)
 compare(m.score(cs,[p],'tps'),first['physical_tps13']);compare(m.score(base,[p],'tps'),first['accepted_baseline_tps']);metric_sets+=2
summary=read(R/'accuracy-summary.json');compare(m.score(cs,checks,'tps'),summary['physical_tps13']);compare(m.score(base,checks,'tps'),summary['accepted_baseline_tps']);metric_sets+=2
assert inside==['IS34','IS36'];windows=read(R/'warped-review/receipt.json');assert windows['raster_sha256']==f['raster_sha256'];assert len(windows['reviews'])==3
for v in windows['reviews']:assert sha(R/'warped-review'/v['figure'])==v['figure_sha256'] and v['source_pixel_alpha']>0
for v in windows['references']:assert sha(Path(v['path']))==v['sha256']
for v in read(R/'browser-review.json')['screenshots']+read(R/'browser-review.json')['states']:assert sha(Path(v['path']))==v['sha256']
browser=read(R/'browser-review.json');assert browser['raster_sha256']==f['raster_sha256'] and browser['console_errors']==[]
for name in ['IS34','IS35','IS36']:
 text=next(Path(v['path']).read_text() for v in browser['states'] if Path(v['path']).name==name+'-import-state.txt');assert 'checkbox "inverness-south-tps13-review-20m" [checked]' in text;assert 'checkbox "south-explicit-affine-20m" [checked]' not in text;assert '4,751×6,488' in text
 text=next(Path(v['path']).read_text() for v in browser['states'] if Path(v['path']).name==name+'-terrain10x-state.txt');assert 'status: 10×' in text
for v in read(R/'reference-provenance.json')['files']:assert sha(Path(v['path']))==v['sha256']
imports=read(R/'import-verification.json')['results'];assert len(imports)==2
for v in imports:assert v['semanticRoundtrip'] and all(c['maxDifferenceProjectedMetres']<.001 for c in v['comparisons'])
status=read(R/'status.json');assert status['fresh_check_count']==3 and status['no_tuning_after_checks'] and not status['geographic_acceptance'];compare(status['physical_tps13'],summary['physical_tps13'])
print(json.dumps(dict(metric_sets_replayed=metric_sets,fresh_observations_audited=3,original_exteriors_verified=2,exact_water_confluences_verified=1,inside_control_hull=inside,outside_control_hull=['IS35'],controls_and_raster_unchanged=True,accepted_baseline_inputs_unchanged=True,actual_raster_windows=3,editable_inventories=2,browser_2d_and_10x_terrain_verified=True,geographic_acceptance=False),indent=2))
