"""Replay frozen geographic checks, paired seam separation and artifact receipts."""
from pathlib import Path
import hashlib,json,subprocess
import numpy as np
from shapely.geometry import Polygon,MultiPoint,Point
from tools.church.gcps import load_gcps,GroundControlPoint
from tools.church.cutlines import Cutline
from score_seam import calculate,score
R=Path(__file__).resolve().parent;ROOT=R.parents[2]
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def compare(a,b):
 if isinstance(b,dict):
  assert a.keys()==b.keys()
  for k,v in b.items():compare(a[k],v)
 elif isinstance(b,list):
  assert len(a)==len(b)
  for x,y in zip(a,b,strict=True):compare(x,y)
 elif isinstance(b,(float,int)):assert abs(a-b)<1e-5,(a,b)
 else:assert a==b,(a,b)
f=read(R/'freeze.json');commit=f['input_commit'];subprocess.run(['git','merge-base','--is-ancestor',commit,'origin/nightly'],check=True)
for v in f['inputs'].values():
 p=ROOT/v['path'];assert sha(p)==v['sha256'];assert p.read_bytes()==subprocess.check_output(['git','show',commit+':'+v['path']])
for name in ['richmond','south']:
 assert (R/(name+'-controls.csv')).read_bytes()==(ROOT/f['inputs'][name+'_controls']['path']).read_bytes();assert sha(Path(f[name+'_raster']['path']))==f[name+'_raster']['sha256']
for v in read(R/'baseline-inputs.json')['inputs']:
 p=ROOT/v['path'];assert sha(p)==v['sha256'];assert p.read_bytes()==subprocess.check_output(['git','show',commit+':'+v['path']])
cs=load_gcps(R/'richmond-controls.csv');sc=load_gcps(R/'south-controls.csv');assert len(cs)==14 and len(sc)==13
rows=load_gcps(R/'richmond-new-validation.csv');assert [p for p in rows if p.role=='control']==cs;checks=[p for p in rows if p.role=='check'];assert [p.label for p in checks]==['R54','R55']
prior=[p for p in load_gcps(ROOT/f['inputs']['richmond_prior_fresh']['path']) if p.role=='check'];diag=load_gcps(ROOT/f['inputs']['richmond_prior_diagnostics']['path']);assert len(prior)==14;assert load_gcps(R/'richmond-cumulative-validation.csv')==cs+prior+checks
assert not {p.label for p in checks}&{p.label for p in cs+prior+diag};assert not {(p.lon,p.lat) for p in checks}&{(p.lon,p.lat) for p in cs+prior+diag}
v4=[p for p in load_gcps(ROOT/'reports/church/physical-review-20260912/richmond/refinement-04/frozen-fit.csv') if p.role=='control'];cutline=Cutline(tuple(map(tuple,read(ROOT/'reports/church/physical-review-20260912/richmond/content-boundary.json')['ring_pixel_xy'])));hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in cs]).convex_hull;features={};count=0
for p in checks:
 path=R/'observations'/(p.label+'.json');o=read(path);fr=o['source_frame'];assert fr['rotation']==0 and fr['source_dimensions']==[35735,30429];assert sha(Path(o['source_crop_path']))==o['source_crop_sha256'];assert o['source_sha256']==read(ROOT/f['inputs']['richmond_freeze']['path'])['source_sha256'];assert o['recorded_at']>read(ROOT/f['inputs']['richmond_freeze']['path'])['frozen_at']
 xy=np.asarray(fr['origin'])+np.asarray(o['source_display_pixel_xy'])*np.asarray(fr['extent'])/np.asarray(fr['display']);assert np.allclose(xy,o['pixel_xy'],atol=1e-8,rtol=0);assert cutline.contains(*xy);assert p==GroundControlPoint(*o['pixel_xy'],*o['lonlat'],'check',o['id'])
 for key,target in [('source_outline_display_pixels','source_display_pixel_xy'),('modern_ring','lonlat')]:
  ring=np.asarray(o[key]);origin=ring.mean(axis=0);poly=Polygon(ring-origin);assert poly.is_valid;assert np.allclose(np.asarray(poly.centroid.coords[0])+origin,o[target],atol=1e-8,rtol=0)
 key=o['reference_path']
 if key not in features:
  assert sha(Path(key))==o['reference_sha256'];features[key]={v['properties']['OBJECTID']:v for v in read(Path(key))['features']}
 fs=features[key];ring=[tuple(v) for v in o['modern_ring']];edges={frozenset((a,b)) for a,b in zip(ring,ring[1:])};original=set()
 for fid in o['reference_feature_ids']:
  v=fs[fid];assert v['properties']['FEAT_CODE']=='WACOIS10';a=[tuple(v[:2]) for v in v['geometry']['coordinates']];original.update(frozenset((a,b)) for a,b in zip(a,a[1:]))
 assert edges<=original
 for v in read(R/'observations'/(p.label+'-reference-features.geojson'))['features']:assert v==fs[v['properties']['OBJECTID']]
 first=read(R/(p.label+'-first.json'));assert first['observation_sha256']==sha(path) and first['freeze_sha256']==sha(R/'freeze.json');assert first['scored_at']>=o['recorded_at'];assert first['inside_control_hull']==hull.covers(Point(*xy))==False
 compare(score(cs,[p],'affine'),first['affine14']);compare(score(v4,[p],'tps'),first['v4_same_feature']);count+=2
for key,model,points,method in [('new2',cs,checks,'affine'),('cumulative16',cs,prior+checks,'affine'),('v4_new2',v4,checks,'tps'),('v4_cumulative16',v4,prior+checks,'tps')]:compare(score(model,points,method),read(R/'accuracy-summary.json')[key]);count+=1
compare(calculate(),read(R/'seam-first.json'));pairs=read(R/'seam-first.json')['pairs'];assert pairs[0]['south_id']=='IS35' and pairs[1]['south_id']=='IS11';assert 'control' in pairs[1]['south_role'];assert next(p for p in sc if p.label=='IS11').role=='control'
# IS35 retains its original south first-validation result, without a new measurement.
south_first=read(ROOT/'reports/church/south-tps13-validation-20260915/IS35-first.json');assert abs(pairs[0]['south_error_against_common_reference']['error_ground_m']-south_first['physical_tps13']['rms_ground_m'])<1e-5
receipt=read(R/'warped-review/receipt.json');assert len(receipt['reviews'])==4
for name in ['richmond','south']:assert receipt['rasters'][name]==f[name+'_raster']
for v in receipt['reviews']:assert sha(R/'warped-review'/v['figure'])==v['figure_sha256'] and v['source_pixel_alpha']>0
assert sha(Path(receipt['reference_path']))==receipt['reference_sha256']
browser=read(R/'browser-review.json');assert browser['console_errors']==[]
for v in browser['screenshots']+browser['states']:assert sha(Path(v['path']))==v['sha256']
for site in ['cranberry','crammond']:
 for name,layer in [('richmond','richmond-affine14-20m'),('south','inverness-south-tps13-review-20m')]:
  text=next(Path(v['path']).read_text() for v in browser['states'] if Path(v['path']).name==site+'-'+name+'-terrain10x-state.txt');assert 'status: 10×' in text and 'checkbox "'+layer+'" [checked]' in text
  other='inverness-south-tps13-review-20m' if name=='richmond' else 'richmond-affine14-20m';assert 'checkbox "'+other+'" [checked]' not in text
imports=read(R/'import-verification.json')['results'];assert len(imports)==3
for v in imports:assert v['controls']==14 and v['semanticRoundtrip'] and all(c['maxDifferenceProjectedMetres']<.001 for c in v['comparisons'])
status=read(R/'status.json');assert status['richmond_fresh_check_count']==16 and status['south_fresh_check_count']==3 and not status['geographic_acceptance'] and not status['fit_changes'];compare(status['richmond_cumulative'],read(R/'accuracy-summary.json')['cumulative16'])
print(json.dumps(dict(geographic_metric_sets_replayed=count,seam_pairs_replayed=2,new_richmond_observations_audited=2,original_exteriors_verified=2,new_richmond_checks_outside_hull=2,richmond_fresh_checks=16,south_fresh_checks_unchanged=3,south_control_pair_not_counted_as_fresh=True,frozen_inputs_and_rasters_unchanged=True,actual_raster_windows=4,editable_inventories=3,browser_terrain_pairs_verified=True,geographic_acceptance=False),indent=2))
