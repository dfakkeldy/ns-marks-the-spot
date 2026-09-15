"""Replay untouched fresh validation, original geometry and frozen input receipts."""
from pathlib import Path
import hashlib,json,importlib.util,subprocess
import numpy as np
from shapely.geometry import Polygon,MultiPoint,Point
from tools.church.gcps import load_gcps,GroundControlPoint
from tools.church.cutlines import Cutline
R=Path(__file__).resolve().parent;E=R/'northern-expansion';ROAD=R/'road-expansion';ROOT=R.parents[2];O=R.parent/'physical-review-20260913/inverness-south';s=importlib.util.spec_from_file_location('score',R.parent/'target-refinement-20260913/score_models.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
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
f=read(R/'freeze.json');commit=f['input_commit'];subprocess.run(['git','merge-base','--is-ancestor',commit,'origin/nightly'],check=True);p=ROOT/f['controls_path'];assert digest(p)==f['controls_sha256'];assert p.read_bytes()==(R/'controls.csv').read_bytes()==subprocess.check_output(['git','show',commit+':'+f['controls_path']]);assert digest(Path(f['raster']))==f['raster_sha256']
for v in read(R/'baseline-inputs.json')['inputs']:
 p=ROOT/v['path'];assert digest(p)==v['sha256'];assert p.read_bytes()==subprocess.check_output(['git','show',commit+':'+v['path']])
cs=load_gcps(R/'controls.csv');base=load_gcps(ROOT/'tools/church/gcps/inverness-south.csv');rows=load_gcps(R/'fresh-validation.csv');assert [p for p in rows if p.role=='control']==cs;checks=[p for p in rows if p.role=='check'];assert [p.label for p in checks]==[f'IS{i}' for i in range(20,30)];assert not {p.label for p in checks}&set(f['prior_selection_features']);assert len({(p.lon,p.lat) for p in cs+checks})==14
refrec=read(R/'reference-receipt.json');refs=Path(refrec['path']);assert digest(refs)==refrec['sha256'];features={v['properties']['OBJECTID']:v for v in read(refs)['features']};assert len(features)==refrec['count']==2406;assert sum(p['count'] for p in refrec['pages'])==2406 and refrec['complete_id_set_verified']
reference_cache={}
def reference_for(path,expected_sha):
 path=Path(path)
 if str(path) not in reference_cache:
  assert digest(path)==expected_sha
  reference_cache[str(path)]={v['properties']['OBJECTID']:v for v in read(path)['features']}
 return reference_cache[str(path)]
published=read(E/'previous-published.json');previous_commit=published['input_commit']
subprocess.run(['git','merge-base','--is-ancestor',previous_commit,'origin/nightly'],check=True)
for record in published['stable_files']:
 path=R/record['path'];assert digest(path)==record['sha256']
 assert path.read_bytes()==subprocess.check_output(['git','show',previous_commit+':'+str(path.relative_to(ROOT))])
assert (R/'fresh-validation.csv').read_bytes().startswith(subprocess.check_output(['git','show',previous_commit+':'+published['previous_csv_path']]))
assert (R/'snapshots/first-five-accuracy.json').read_bytes()==subprocess.check_output(['git','show',previous_commit+':'+published['previous_accuracy_path']])
road_published=read(ROAD/'previous-published.json');road_commit=road_published['input_commit']
subprocess.run(['git','merge-base','--is-ancestor',road_commit,'origin/nightly'],check=True)
for record in road_published['stable_files']:
 path=R/record['path'];assert digest(path)==record['sha256']
 assert path.read_bytes()==subprocess.check_output(['git','show',road_commit+':'+str(path.relative_to(ROOT))])
assert (R/'fresh-validation.csv').read_bytes().startswith(subprocess.check_output(['git','show',road_commit+':'+road_published['previous_csv_path']]))
assert (R/'snapshots/first-seven-accuracy-summary.json').read_bytes()==subprocess.check_output(['git','show',road_commit+':'+road_published['previous_accuracy_path']])
for dataset in read(ROAD/'reference-provenance.json')['layers']:
 raw=Path(dataset['path']);assert digest(raw)==dataset['sha256'];rows=read(raw)['features'];ids={v['properties']['OBJECTID'] for v in rows}
 assert len(rows)==len(ids)==read(ROAD/dataset['receipt'])['count']
 assert ids==set(read(ROAD/(dataset['name']+'-id-audit.json'))['objectIds'])
hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in cs]).convex_hull;cutline=Cutline(tuple(map(tuple,read(O/'final-artifact-receipt.json')['source_cutline'])));count=0
for q in checks:
 path=R/'observations'/f'{q.label}.json';o=read(path);fr=o['source_frame'];assert fr['rotation']==0;native=np.asarray(fr['origin'])+np.asarray(o['source_display_pixel_xy'])*np.asarray(fr['extent'])/np.asarray(fr['display']);assert np.allclose(native,o['pixel_xy'],rtol=0,atol=1e-8);assert cutline.contains(*native);assert digest(Path(o['source_crop_path']))==o['source_crop_sha256'];features=reference_for(o['reference_path'],o['reference_sha256']);assert f['frozen_at']<o['recorded_at'];assert q==GroundControlPoint(*o['pixel_xy'],*o['lonlat'],'check',q.label)
 if 'modern_ring' in o:
  for key,point in [('source_outline_display_pixels','source_display_pixel_xy'),('modern_ring','lonlat')]:
   poly=Polygon(o[key]);assert poly.is_valid;assert np.allclose(poly.centroid.coords[0],o[point],rtol=0,atol=1e-10)
  ring=[tuple(v) for v in o['modern_ring']];edges={frozenset((a,b)) for a,b in zip(ring,ring[1:])};original=set()
  for fid in o['reference_feature_ids']:
   v=features[fid];assert v['properties']['FEAT_CODE']=='WALK20';a=[tuple(p[:2]) for p in v['geometry']['coordinates']];original.update(frozenset((x,y)) for x,y in zip(a,a[1:]))
  assert edges<=original
 else:
  for v in o['reference_vertices']:assert features[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2]==o['lonlat']
 for v in o.get('corroborating_reference_vertices',[]):
  support=reference_for(v['reference_path'],v['reference_sha256']);assert support[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2]==o['lonlat']
 first=read(R/f'{q.label}-first.json');assert digest(path)==first['observation_sha256'];assert digest(R/'freeze.json')==first['freeze_sha256'];assert not hull.covers(Point(q.pixel_x,q.pixel_y)) and not first['inside_control_hull'];compare(m.score(cs,[q],'affine'),first['physical_affine']);compare(m.score(base,[q],'tps'),first['accepted_baseline_tps']);count+=2
for v in read(R/'crop-provenance.json')+read(E/'crop-provenance.json'):
 assert digest(Path(v['parent_path']))==v['parent_sha256'];o=next(read(p) for p in [R/'observations'/f'IS{i}.json' for i in range(20,30)] if Path(read(p)['source_crop_path']).name==v['derived']);fr=o['source_frame'];parent=v['parent_frame'];box=fr['derived_crop_box'];scale=np.asarray(parent['extent'])/np.asarray(parent['display']);assert np.allclose(np.asarray(parent['origin'])+np.asarray(box[:2])*scale,fr['origin']);assert np.allclose((np.asarray(box[2:])-box[:2])*scale,fr['extent'])
for expected,points in [(read(R/'accuracy-summary.json'),checks),(read(R/'regional-summary.json')['western_coast'],checks[:2]),(read(R/'regional-summary.json')['southwestern_lakes'],checks[2:5]),(read(R/'snapshots/first-five-accuracy.json'),checks[:5]),(read(E/'accuracy-summary.json'),checks[5:7]),(read(R/'snapshots/first-seven-accuracy-summary.json'),checks[:7]),(read(ROAD/'accuracy-summary.json'),checks[7:])]:
 compare(m.score(cs,points,'affine'),expected['physical_affine']);compare(m.score(base,points,'tps'),expected['accepted_baseline_tps']);count+=2
for v in read(R/'warped-review/receipt.json')['reviews']:assert digest(R/'warped-review'/v['figure'])==v['figure_sha256'];assert v['source_pixel_alpha']>0
for v in read(R/'browser-review.json')['screenshots']+read(R/'browser-review.json')['states']+read(E/'browser-review.json')['screenshots']+read(E/'browser-review.json')['states']+read(ROAD/'browser-review.json')['screenshots']+read(ROAD/'browser-review.json')['states']:assert digest(Path(v['path']))==v['sha256']
for v in read(E/'warped-review/receipt.json')['reviews']:assert digest(E/'warped-review'/v['figure'])==v['figure_sha256'];assert v['source_pixel_alpha']>0
for v in read(ROAD/'warped-review/receipt.json')['reviews']:assert digest(ROAD/'warped-review'/v['figure'])==v['figure_sha256'];assert v['source_pixel_alpha']>0
assert len(read(R/'import-verification.json')['results'])==4
status=read(R/'status.json');assert status['no_tuning_after_checks'] and status['fresh_check_count']==10 and not status['geographic_acceptance'];compare(status['physical_affine'],read(R/'accuracy-summary.json')['physical_affine'])
print(json.dumps(dict(metric_sets_replayed=count,fresh_observations_audited=10,derived_crop_frames_verified=3,reference_features_by_file={Path(k).name:len(v) for k,v in reference_cache.items()},original_lake_exteriors_verified=3,all_checks_outside_control_hull=True,retained_affine_and_raster_unchanged=True,accepted_baseline_inputs_unchanged=True,actual_raster_windows=10,editable_inventories=4,first_five_inputs_unchanged=True,first_seven_inputs_unchanged=True,transport_source_id_sets_verified=4,geographic_acceptance=False),indent=2))
