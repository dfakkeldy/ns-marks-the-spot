"""Replay first results, explicit reference repair, and one frozen-model seam."""
from pathlib import Path
import json,hashlib,subprocess,importlib.util,math
import numpy as np
from shapely.geometry import MultiPoint,Point
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.cutlines import Cutline
from tools.church.georeference import build_gcp_arguments
from tools.church.geometry import mercator_to_lonlat
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
def pin(f):
 subprocess.run(['git','merge-base','--is-ancestor',f['input_commit'],'origin/nightly'],check=True)
 for v in f['inputs'].values():
  p=ROOT/v['path'];assert sha(p)==v['sha256'];assert p.read_bytes()==subprocess.check_output(['git','show',f['input_commit']+':'+v['path']])
def gcp(o):return GroundControlPoint(*o['pixel_xy'],*o['lonlat'],'check',o['id'])
f=read(R/'freeze.json');pin(f);si=read(R/'seam-inputs.json');pin(si);cs=load_gcps(R/'controls.csv');assert len(cs)==13 and (R/'controls.csv').read_bytes()==(ROOT/f['inputs']['controls']['path']).read_bytes();assert sha(Path(f['raster']))==f['raster_sha256'];assert sha(Path(si['victoria_raster']))==si['victoria_raster_sha256']
prior=[p for p in load_gcps(ROOT/f['inputs']['prior_inventory']['path']) if p.role=='check'];assert len(prior)==18;base=load_gcps(ROOT/f['inputs']['baseline_controls']['path']);hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in cs]).convex_hull;cutline=Cutline(tuple(map(tuple,read(R.parent/'south-distributed-refinement-20260915/content-boundary.json')['ring_pixel_xy'])));obs={};fs=None;count=0
names=read(R/'search-evidence/coastal-names.geojson');assert sha(R/'search-evidence/coastal-names.geojson')==read(R/'search-evidence/coastal-names-receipt.json')['sha256']
def replay(model,points,expected):
 global count
 compare(m.score(model,points,'tps'),expected);count+=1
for ident in ['IS52','IS53']:
 path=R/'observations'/(ident+'.json');o=read(path);obs[ident]=o;fr=o['source_frame'];assert fr['rotation']==0 and sha(Path(o['source_crop_path']))==o['source_crop_sha256'];xy=np.asarray(fr['origin'])+np.asarray(o['source_display_pixel_xy'])*np.asarray(fr['extent'])/np.asarray(fr['display']);assert np.allclose(xy,o['pixel_xy'],atol=1e-9,rtol=0) and cutline.contains(*xy)
 assert sha(Path(o['reference_path']))==o['reference_sha256'];fs={v['properties']['OBJECTID']:v for v in read(Path(o['reference_path']))['features']};q=o['reference_vertices'][0];assert len(o['reference_vertices'])==1 and fs[q['feature_id']]['geometry']['coordinates'][q['vertex']][:2]==o['lonlat'] and fs[q['feature_id']]['properties']['FEAT_CODE']=='WACO20'
 name='maciver' if ident=='IS52' else 'malagawatch';candidates=read(R/'search-evidence'/(name+'-expanded-coast-vertices.json'));select=min if ident=='IS52' else max;assert select(candidates,key=lambda v:v['lonlat'][0])['lonlat']==o['lonlat'];label='MacIvers Point' if ident=='IS52' else 'Malagawatch Point';n=next(v for v in names['features'] if v['properties']['geoname']==label and v['properties']['concise_ds']=='Cape');lon,lat=n['geometry']['coordinates'];c=math.cos(math.radians(lat));rebuilt=[]
 for feature in fs.values():
  if feature['properties']['FEAT_CODE']!='WACO20':continue
  for i,v in enumerate(feature['geometry']['coordinates']):
   d=math.hypot((v[0]-lon)*111195*c,(v[1]-lat)*111195)
   if d<700:rebuilt.append(dict(feature_id=feature['properties']['OBJECTID'],vertex=i,lonlat=v[:2],distance_from_name_m=d))
 compare(rebuilt,candidates);first=read(R/(ident+'-first.json'));assert first['observation_sha256']==sha(path) and first['freeze_sha256']==sha(R/'freeze.json') and first['scored_at']>=o['recorded_at'];assert not first['inside_control_hull'] and not hull.covers(Point(*xy));assert read(ROOT/f['inputs']['selection_freeze']['path'])['frozen_at']<o['recorded_at'];replay(cs,[gcp(o)],first['physical_tps13']);replay(base,[gcp(o)],first['accepted_baseline_tps'])
old52=gcp(obs['IS52']);p53=gcp(obs['IS53']);corr=read(R/'observations/IS52-corrected.json');cp=gcp(corr);audit=read(R/'IS52-reference-audit.json');vm=read(ROOT/si['inputs']['observation']['path']);vcs=load_gcps(ROOT/si['inputs']['controls']['path']);vp=GroundControlPoint(*vm['pixel_xy'],*vm['lonlat'],'check','VM27')
for key in ['pixel_xy','source_frame','source_display_pixel_xy','source_crop_sha256','source_sha256','uncertainty_ground_m']:assert corr[key]==obs['IS52'][key]
assert corr['lonlat']==vm['lonlat']==fs[10117]['geometry']['coordinates'][62][:2];assert corr['reference_vertices']==[vm['reference_vertex']];assert obs['IS52']['reference_vertices']==[dict(feature_id=10117,vertex=80)];assert vm['recorded_at']<obs['IS52']['recorded_at'];assert audit['original_observation_sha256']==sha(R/'observations/IS52.json') and audit['corrected_observation_sha256']==sha(R/'observations/IS52-corrected.json') and audit['original_first_result_sha256']==sha(R/'IS52-first.json');assert not audit['source_pixel_changed'] and not audit['fit_changed'] and not audit['untouched_fresh_check']
assert sha(Path(vm['source_crop_path']))==vm['source_crop_sha256'];vf=vm['source_frame'];assert np.allclose(np.array(vf['origin'])+np.array(vm['source_display_pixel_xy'])*np.array(vf['extent'])/np.array(vf['display']),vm['pixel_xy'],atol=1e-8,rtol=0)
assert load_gcps(R/'first-twenty.csv')==cs+prior+[old52,p53];assert load_gcps(R/'fresh-validation.csv')==cs+prior+[p53];assert load_gcps(R/'corrected-validation.csv')==cs+prior+[cp,p53];assert load_gcps(R/'new-checks.csv')==cs+[p53];assert load_gcps(R/'corrected-check.csv')==cs+[cp];assert len({(p.lon,p.lat) for p in cs+prior+[cp,p53]})==33
for name in ['first-twenty.csv','fresh-validation.csv','corrected-validation.csv']:assert (R/name).read_bytes().startswith((ROOT/f['inputs']['prior_inventory']['path']).read_bytes())
a=read(R/'accuracy-summary.json');previous=read(ROOT/f['inputs']['prior_accuracy']['path']);original=read(R/'first-twenty-summary.json')
for points,result,keys in [(prior,previous,('physical_tps13','accepted_baseline_tps')),(prior+[old52,p53],original,('physical_tps13','accepted_baseline_tps')),([old52,p53],original,('new_pair_tps13','new_pair_baseline')),(prior+[p53],a,('physical_tps13','accepted_baseline_tps')),(prior+[cp,p53],a,('corrected_twenty_tps13','corrected_twenty_baseline')),([cp,p53],a,('corrected_pair_tps13','corrected_pair_baseline')),([cp],audit,('physical_tps13','accepted_baseline_tps'))]:replay(cs,points,result[keys[0]]);replay(base,points,result[keys[1]])
replay(vcs,[vp],audit['victoria_diagnostic_tps14'])
def predict(model,p):
 out=subprocess.check_output(['gdaltransform','-tps',*build_gcp_arguments(model)],input=f'{p.pixel_x} {p.pixel_y}\n',text=True);return list(mercator_to_lonlat(*map(float,out.split()[:2])))
def delta(a,b):
 e=6371008.8*math.radians(a[0]-b[0])*math.cos(math.radians((a[1]+b[1])/2));n=6371008.8*math.radians(a[1]-b[1]);return dict(east_ground_m=e,north_ground_m=n,distance_ground_m=math.hypot(e,n))
seam=read(R/'macivers-seam.json');sp=predict(cs,cp);vv=predict(vcs,vp);compare(sp,seam['south_prediction_lonlat']);compare(vv,seam['victoria_prediction_lonlat']);compare(delta(sp,vv),seam['south_minus_victoria']);compare(delta(obs['IS52']['lonlat'],corr['lonlat']),seam['original_reference_minus_corrected'])
w=read(R/'warped-review/receipt.json');assert len(w['reviews'])==2 and w['raster_sha256']==f['raster_sha256']
for v in w['reviews']:assert sha(R/'warped-review'/v['figure'])==v['figure_sha256'] and v['source_pixel_alpha']>0
for v in w['references']:assert sha(Path(v['path']))==v['sha256']
sr=read(R/'seam-review/receipt.json');assert sr['victoria_raster_sha256']==si['victoria_raster_sha256'] and sr['victoria_source_pixel_alpha']>0
for key in ['south_figure','victoria_figure']:assert sha(R/sr[key]['path'])==sr[key]['sha256']
assert sha(R/'seam-review/side-by-side.jpg')==sr['combined_sha256'];ov=read(R/'coverage-overview.json');assert len(ov['points'])==33 and sha(R/'coverage-overview.jpg')==ov['figure_sha256']
br=read(R/'browser-review.json');assert br['console_errors']==[] and br['raster_sha256']==f['raster_sha256']
for v in br['screenshots']+br['states']:assert sha(Path(v['path']))==v['sha256']
for ident in ['IS52','IS53']:
 state=next(Path(v['path']).read_text() for v in br['states'] if Path(v['path']).name==ident+'-import-state.txt');assert 'checkbox "inverness-south-tps13-review-20m" [checked]' in state
 state=next(Path(v['path']).read_text() for v in br['states'] if Path(v['path']).name==ident+'-terrain10x-state.txt');assert 'status: 10×' in state
for panel,label in [('south','inverness-south-tps13-review-20m'),('victoria','victoria-main-corrected-tps14-review-20m')]:
 state=next(Path(v['path']).read_text() for v in br['states'] if Path(v['path']).name=='IS52-corrected-'+panel+'-state.txt');assert 'checkbox "'+label+'" [checked]' in state and '46.03843' in state
 state=next(Path(v['path']).read_text() for v in br['states'] if Path(v['path']).name=='IS52-corrected-'+panel+'-terrain-state.txt');assert 'status: 10×' in state and 'checkbox "'+label+'" [checked]' in state
imports=read(R/'import-verification.json')['results'];assert len(imports)==5
for v in imports:assert v['semanticRoundtrip'] and all(q['maxDifferenceProjectedMetres']<.001 for q in v['comparisons'])
st=read(R/'status.json');assert st['fresh_check_count']==19 and st['corrected_check_count']==1 and st['corrected_validation_count']==20 and not st['geographic_acceptance'];compare(st['physical_tps13'],a['physical_tps13']);compare(st['corrected_twenty_tps13'],a['corrected_twenty_tps13'])
print(json.dumps(dict(metric_sets_replayed=count,untouched_fresh_checks=19,corrected_reference_diagnostics=1,corrected_inventory_checks=20,original_wrong_correspondence_and_first_scores_preserved=True,source_pixels_and_fits_unchanged=True,shared_model_seams=1,actual_raster_windows=3,editable_inventories=5,geographic_acceptance=False),indent=2))
