"""Replay frozen eastern checks, source frames, original geometry and receipts."""
import hashlib,importlib.util,json,subprocess
from pathlib import Path
import numpy as np
from shapely.geometry import MultiPoint,Point,Polygon
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.cutlines import Cutline
R=Path(__file__).resolve().parent;ROOT=R.parents[2];G=R.parent/'cape-breton-regional-20260915'
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
for key in ['controls','fit_freeze','previous_cumulative','previous_summary']:
 p=ROOT/manifest[key];assert digest(p)==manifest[key+'_sha256'];assert subprocess.check_output(['git','show',commit+':'+manifest[key]])==p.read_bytes()
assert (R/'controls.csv').read_bytes()==(ROOT/manifest['controls']).read_bytes()
assert digest(Path(manifest['raster']))==manifest['raster_sha256']
cs=load_gcps(R/'controls.csv');base=load_gcps(R.parent/'cape-breton-continuation-20260915/affine3-controls.csv');hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in cs]).convex_hull
assert len(cs)==11 and all(p.role=='control' for p in cs)
checks=[p for p in load_gcps(R/'cumulative-fresh.csv') if p.role=='check'];assert [p.label for p in checks]==[f'CB{i}' for i in range(18,26)]
assert checks[:6]==[p for p in load_gcps(ROOT/manifest['previous_cumulative']) if p.role=='check']
assert not set((p.lon,p.lat) for p in cs)&set((p.lon,p.lat) for p in checks)
refs=Path('/Users/dfakkeldy/Downloads/church-review-20260913/cape-water-lines.geojson');features={f['properties']['OBJECTID']:f for f in read(refs)['features']}
cutline=Cutline(tuple(map(tuple,read(G/'content-boundary.json')['ring_pixel_xy'])))
freeze=read(ROOT/manifest['fit_freeze']);count=0
for name in ['CB24','CB25']:
 path=R/'observations'/f'{name}.json';p=read(path);f=p['source_frame'];assert f['rotation']==0
 native=np.asarray(f['origin'])+np.asarray(p['source_display_pixel_xy'])*np.asarray(f['extent'])/np.asarray(f['display'])
 assert np.allclose(native,p['pixel_xy'],rtol=0,atol=1e-9);assert cutline.contains(*p['pixel_xy']);assert digest(Path(p['source_crop_path']))==p['source_crop_sha256'];assert digest(refs)==p['reference_sha256']
 if name=='CB24':
  for v in p['reference_vertices']:assert features[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2]==p['lonlat']
 else:
  source=Polygon(p['source_outline_display_pixels']);ring=Polygon(p['modern_ring']);assert source.is_valid and ring.is_valid
  assert np.allclose(source.centroid.coords[0],p['source_display_pixel_xy'],rtol=0,atol=1e-9)
  assert np.allclose(ring.centroid.coords[0],p['lonlat'],rtol=0,atol=1e-12)
  vertices={tuple(v[:2]) for i in p['reference_feature_ids'] for v in features[i]['geometry']['coordinates']}
  assert all(tuple(v) in vertices for v in p['modern_ring'])
 assert freeze['frozen_at']<p['recorded_at']
 q=GroundControlPoint(*p['pixel_xy'],*p['lonlat'],'check',name);first=read(R/f'{name}-first.json')
 assert digest(path)==first['observation_sha256'];assert first['fit_freeze_sha256']==manifest['fit_freeze_sha256']
 compare(scorer.score(cs,[q],'tps'),first['tps11']);compare(scorer.score(base,[q],'affine'),first['baseline_affine3']);count+=2
 assert hull.covers(Point(q.pixel_x,q.pixel_y))==first['inside_control_hull']
summary=read(R/'accuracy-summary.json')
for label,rows in [('cumulative',checks),('new_two',checks[6:])]:
 for method,controls in [('tps11',cs),('baseline_affine3',base)]:compare(scorer.score(controls,rows,'tps' if method=='tps11' else 'affine'),summary[label+'_'+method]);count+=1
for p,n in [('new-checks.csv',2),('cumulative-fresh.csv',8)]:
 rows=load_gcps(R/p);assert [q for q in rows if q.role=='control']==cs;assert len([q for q in rows if q.role=='check'])==n
for view in read(R/'warped-review/receipt.json')['reviews']:assert digest(R/'warped-review'/view['figure'])==view['figure_sha256'];assert view['source_pixel_alpha']>0
for shot in read(R/'browser-review.json')['screenshots']:assert digest(Path(shot['path']))==shot['sha256']
assert len(read(R/'import-verification.json')['results'])==3
assert not read(R/'status.json')['geographic_acceptance']
assert 'cape-breton-eastern-20260915/README.md' in (ROOT/'docs/CHURCH_MAPS.md').read_text()
print(json.dumps(dict(metric_sets_replayed=count,new_observations_audited=2,fresh_check_count=8,fit_and_raster_unchanged=True,new_raster_windows=2,editable_inventories=3,geographic_acceptance=False),indent=2))
