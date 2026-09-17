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
cs=load_gcps(R/'controls.csv');assert len(cs)==14 and (R/'controls.csv').read_bytes()==(ROOT/f['inputs']['controls']['path']).read_bytes();assert sha(Path(f['raster']))==f['raster_sha256'];prior=[p for p in load_gcps(ROOT/f['inputs']['prior_inventory']['path']) if p.role=='check'];assert len(prior)==16;base=[p for p in load_gcps(ROOT/f['inputs']['baseline_controls']['path']) if p.role=='control'];assert len(base)==10
path=R/'observations/R56.json';o=read(path);fr=o['source_frame'];assert fr['rotation']==0 and fr['source_dimensions']==[35735,30429];assert sha(Path(o['source_crop_path']))==o['source_crop_sha256'];xy=np.asarray(fr['origin'])+np.asarray(o['source_display_pixel_xy'])*np.asarray(fr['extent'])/np.asarray(fr['display']);assert np.allclose(xy,o['pixel_xy'],atol=1e-8,rtol=0);cutline=Cutline(tuple(map(tuple,read(ROOT/'reports/church/physical-review-20260912/richmond/content-boundary.json')['ring_pixel_xy'])));assert cutline.contains(*xy);selection=read(ROOT/f['inputs']['selection_freeze']['path']);assert selection['frozen_at']<o['recorded_at'] and selection['source_sha256']==o['source_sha256'];assert read(R/'search-evidence/source-verification.json')['sha256']==o['source_sha256']
ref=Path(o['reference_path']);assert sha(ref)==o['reference_sha256'];fs={v['properties']['OBJECTID']:v for v in read(ref)['features']};assert len(o['reference_vertices'])==3
for v in o['reference_vertices']:assert fs[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2]==o['lonlat']
assert [fs[v['feature_id']]['properties']['FEAT_CODE'] for v in o['reference_vertices']]==['WARV50','WALK20','WALK20']
for v in read(R/'observations/R56-reference-features.geojson')['features']:assert v==fs[v['properties']['OBJECTID']]
p=GroundControlPoint(*o['pixel_xy'],*o['lonlat'],'check','R56');assert load_gcps(R/'fresh-validation.csv')==cs+prior+[p] and load_gcps(R/'new-check.csv')==cs+[p];assert (R/'fresh-validation.csv').read_bytes().startswith((ROOT/f['inputs']['prior_inventory']['path']).read_bytes());diagnostics=load_gcps(ROOT/f['inputs']['diagnostics']['path']);assert p.label not in {q.label for q in cs+prior+diagnostics} and (p.lon,p.lat) not in {(q.lon,q.lat) for q in cs+prior+diagnostics}
first=read(R/'R56-first.json');assert first['observation_sha256']==sha(path) and first['freeze_sha256']==sha(R/'freeze.json') and first['scored_at']>=o['recorded_at'];assert first['inside_control_hull']==MultiPoint([(q.pixel_x,q.pixel_y) for q in cs]).convex_hull.covers(Point(*xy))
a=read(R/'accuracy-summary.json');old=read(ROOT/f['inputs']['prior_accuracy']['path']);count=0
for points,affine,tps in [([p],first['affine14'],first['v4_same_feature']),(prior+[p],a['affine14'],a['v4_same_checks']),(prior,old['cumulative16'],old['v4_cumulative16'])]:compare(m.score(cs,points,'affine'),affine);compare(m.score(base,points,'tps'),tps);count+=2
# Confirm the bounded False Bay search was a cache audit, not a replacement reference for R56.
rr=read(R/'search-evidence/reference-receipt.json');fresh=read(Path(rr['path']));assert sha(Path(rr['path']))==rr['sha256'] and rr['count']==104 and rr['complete_id_set_verified'];assert len(fresh['features'])==104
for v in fresh['features']:assert v['geometry']==fs[v['properties']['OBJECTID']]['geometry']
assert read(R/'search-evidence/false-bay-cache-audit.json')['new_ids']==[]
w=read(R/'warped-review/receipt.json');assert w['raster_sha256']==f['raster_sha256'] and len(w['reviews'])==1
for v in w['reviews']:assert sha(R/'warped-review'/v['figure'])==v['figure_sha256'] and v['source_pixel_alpha']>0
for v in w['references']:assert sha(Path(v['path']))==v['sha256']
ov=read(R/'coverage-overview.json');assert sha(R/'coverage-overview.jpg')==ov['figure_sha256'] and ov['raster_sha256']==f['raster_sha256'] and len(ov['points'])==31
br=read(R/'browser-review.json');assert br['console_errors']==[] and br['raster_sha256']==f['raster_sha256']
for v in br['screenshots']+br['states']:assert sha(Path(v['path']))==v['sha256']
state=next(Path(v['path']).read_text() for v in br['states'] if Path(v['path']).name=='R56-import-state.txt');assert 'checkbox "richmond-affine14-20m" [checked]' in state and '6,532×4,513' in state
state=next(Path(v['path']).read_text() for v in br['states'] if Path(v['path']).name=='R56-terrain10x-state.txt');assert 'status: 10×' in state
imports=read(R/'import-verification.json')['results'];assert len(imports)==3
for v in imports:assert v['controls']==14 and v['semanticRoundtrip'] and all(q['maxDifferenceProjectedMetres']<.001 for q in v['comparisons'])
st=read(R/'status.json');assert st['fresh_check_count']==17 and not st['fit_changes'] and not st['geographic_acceptance'];compare(st['affine14'],a['affine14'])
print(json.dumps(dict(metric_sets_replayed=count,new_physical_checks=1,fresh_checks=17,original_lake_stream_junction_verified=True,prior_sixteen_and_frozen_fit_preserved=True,bounded_reference_query_geometry_unchanged=True,actual_raster_windows=1,editable_inventories=3,browser_terrain_verified=True,geographic_acceptance=False),indent=2))
