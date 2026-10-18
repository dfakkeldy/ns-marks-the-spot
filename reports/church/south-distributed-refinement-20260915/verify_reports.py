"""Replay preserved trials and verify input isolation and actual-raster receipts."""
from pathlib import Path
import hashlib, importlib.util, json, subprocess
import numpy as np
from tools.church.gcps import load_gcps
R=Path(__file__).resolve().parent;ROOT=R.parents[2];S=R/'selected-tps13'
spec=importlib.util.spec_from_file_location('score',R.parent/'target-refinement-20260913/score_models.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
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
f=read(S/'freeze.json');inputs=read(R/'training-inputs.json');commit=inputs['input_commit'];assert commit==f['training_input_commit'];subprocess.run(['git','merge-base','--is-ancestor',commit,'origin/nightly'],check=True)
observations={}
for v in inputs['inputs']:
 p=ROOT/v['path'];assert sha(p)==v['sha256'];assert p.read_bytes()==subprocess.check_output(['git','show',commit+':'+v['path']]);o=read(p)
 for point in o.get('points',[o]):observations[point['id']]=point
c4=load_gcps(R.parent/'south-validation-20260915/controls.csv');c11=load_gcps(R/'controls.csv');c13=load_gcps(S/'controls.csv');base=load_gcps(ROOT/'tools/church/gcps/inverness-south.csv')
assert len(c13)==13 and len(c11)==11 and c13[:11]==c11
assert (S/'controls.csv').read_bytes()==(R/'thirteen-controls/controls.csv').read_bytes()
assert sha(S/'controls.csv')==f['controls_csv_sha256'];assert sha(R/'content-boundary.json')==f['boundary_sha256']
for p in c13:
 o=observations[p.label];assert [p.pixel_x,p.pixel_y]==o['pixel_xy'] and [p.lon,p.lat]==o['lonlat']
assert read(R/'content-boundary.json')['ring_pixel_xy']==read(R.parent/'physical-review-20260913/inverness-south/final-artifact-receipt.json')['source_cutline']
count=0
for folder,controls,n in [(R,c11,16),(R/'thirteen-controls',c13,14)]:
 rows=load_gcps(folder/'diagnostics.csv');assert [p for p in rows if p.role=='control']==controls;checks=[p for p in rows if p.role=='check'];assert len(checks)==n
 # Exclude both labels and coordinate aliases of every promoted physical feature.
 assert not {p.label for p in controls}&{p.label for p in checks};assert not {(p.lon,p.lat) for p in controls}&{(p.lon,p.lat) for p in checks}
 for name,groups in read(folder/'comparison.json')['models'].items():
  cs,method={'retained-affine4':(c4,'affine'),'accepted-baseline-tps':(base,'tps'),'distributed-affine11':(c11,'affine'),'distributed-tps11':(c11,'tps'),'distributed-affine13':(c13,'affine'),'distributed-tps13':(c13,'tps')}[name]
  for expected in groups.values():
   labels=[p['label'] for p in expected['points']];subset=[next(p for p in checks if p.label==label) for label in labels];compare(m.score(cs,subset,method),expected);count+=1
role=read(R/'role-history.json');assert role['controls13']==[p.label for p in c13];assert role['excluded_from_candidate_checks']==role['controls13'];assert role['candidate_fresh_checks']==0
recent=[p.label for p in load_gcps(R/'thirteen-controls/diagnostics.csv') if p.role=='check' and p.label.startswith('IS')];assert recent==role['candidate_recent_diagnostics']
a=read(S/'artifact-receipt.json');assert a['controls_sha256']==sha(S/'controls.csv');assert a['freeze_sha256']==sha(S/'freeze.json');assert a['boundary_sha256']==sha(R/'content-boundary.json')
embedded=read(S/'embedded-import-verification.json');raster=Path(embedded['source']);assert sha(raster)==a['output_sha256']==embedded['sha256'];assert list(embedded['pixelSize'].values())==a['size'];assert embedded['georef']['geotransform']==a['geotransform'];assert embedded['maxMeshDifferenceProjectedMetres']<.001
cov=read(S/'coverage.json');assert cov['raster_sha256']==a['output_sha256'] and cov['cutline_sha256']==a['cutline_sha256'];assert cov['passed'] and cov['transparent_interior_cells']==0 and cov['expected_interior_cells']==22702159
assert a['orientation']['nonnegative_determinants']==0 and a['orientation']['sample_count']==36615
windows=read(S/'warped-review/receipt.json');assert windows['raster_sha256']==a['output_sha256'];assert len(windows['reviews'])==len({v['id'] for v in windows['reviews']})==27
for v in windows['reviews']:assert sha(S/'warped-review'/v['figure'])==v['figure_sha256'] and v['source_pixel_alpha']>0
for v in windows['references']:assert sha(Path(v['path']))==v['sha256']
browser=read(R/'browser-review.json');assert browser['raster_sha256']==a['output_sha256'] and not browser['console_errors']
for v in browser['screenshots']+browser['states']:assert sha(Path(v['path']))==v['sha256']
for name in ['imported-state.txt','reloaded-state.txt']:
 text=next(Path(v['path']).read_text() for v in browser['states'] if Path(v['path']).name==name);assert 'checkbox "inverness-south-tps13-review-20m" [checked]' in text;assert 'checkbox "south-explicit-affine-20m" [checked]' not in text;assert '4,751×6,488' in text
for name in ['mclennan-terrain10x-topdown-state.txt','skye-terrain10x-state.txt']:
 text=next(Path(v['path']).read_text() for v in browser['states'] if Path(v['path']).name==name);assert 'slider "Height exaggeration"' in text and 'status: 10×' in text
imports=read(R/'import-verification.json');assert len(imports['results'])==5
for v in imports['results']:
 assert v['semanticRoundtrip'];assert max(q['maxDifferenceProjectedMetres'] for q in v['comparisons'])<.001
status=read(R/'status.json');assert status['fresh_check_count']==0 and not status['geographic_acceptance'] and not status['accepted_july_baseline_replaced'];compare(status['selection_diagnostics'],read(R/'thirteen-controls/comparison.json')['models']['distributed-tps13'])
print(json.dumps(dict(metric_sets_replayed=count,unchanged_original_controls=13,promoted_aliases_excluded=True,fresh_checks=0,editable_inventories=5,actual_raster_windows=27,zero_alpha_holes=True,orientation_samples=36615,production_embedded_import_verified=True,browser_import_reload_and_terrain_receipts_verified=True,geographic_acceptance=False),indent=2))
