"""Replay immutable scores, input identity and role isolation without regenerating evidence."""
import sys,json,hashlib,subprocess,math
from pathlib import Path
sys.path.insert(0,str(Path('reports/church/target-refinement-20260913').resolve()))
from score_models import score
from tools.church.gcps import load_gcps,GroundControlPoint
R=Path(__file__).resolve().parent
OLD=Path('reports/church/inverness-north-continuation-20260914')
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def compare(a,b):
 if isinstance(a,dict):
  assert a.keys()==b.keys()
  for k in a:compare(a[k],b[k])
 elif isinstance(a,list):
  assert len(a)==len(b)
  for x,y in zip(a,b):compare(x,y)
 elif isinstance(a,float):assert math.isclose(a,b,abs_tol=1e-6), (a,b)
 else:assert a==b,(a,b)
cs=load_gcps(R/'trials/tps5-controls.csv');assert sha(OLD/'north-tip-trial/controls.csv')==read(R/'input-provenance.json')['previous_controls_sha256']
rev=read(R/'input-provenance.json')['nightly_commit'];subprocess.run(['git','merge-base','--is-ancestor',rev,'origin/nightly'],check=True)
assert subprocess.check_output(['git','show',f'{rev}:{OLD}/north-tip-trial/controls.csv'])==(OLD/'north-tip-trial/controls.csv').read_bytes()
obs={}
water=Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson');assert sha(water)=='3ab9f95a5f82d4749da1742ec68339b2fdbdd9adeb38e93f36580693cfcb37ad'
features=json.loads(water.read_text())['features'];byid={f['properties']['OBJECTID']:f for f in features}
for ident in ['I16','I17']:
 o=read(R/'observations'/f'{ident}.json');f=o['source_frame'];assert f['extent']==f['display'] and f['rotation']==0
 assert sha(Path(o['source_crop_path']))==o['source_crop_sha256']
 for v in o['reference_vertices']:assert byid[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2]==o['lonlat']
 obs[ident]=GroundControlPoint(*o['pixel_xy'],*o['lonlat'],'check',ident)
diag=[p for p in load_gcps(OLD/'north-tip-trial/diagnostic-review.csv') if p.role=='check'];stored=read(R/'trial-results.json')
for name in ['tps5','plus-calumruadh','plus-presquile','plus-both']:
 controls=load_gcps(R/f'trials/{name}-controls.csv');assert 'I16' not in {p.label for p in controls}
 for method in ['affine','tps']:compare(stored[f'{name}-{method}'],score(controls,diag,method))
compare(read(R/'I17-first-tps5.json'),score(cs,[obs['I17']],'tps'))
selected=load_gcps(R/'selected/controls.csv');assert sha(R/'selected/controls.csv')==read(R/'selected/freeze.json')['controls_csv_sha256']
compare(read(R/'I16-selected-tps6.json'),score(selected,[obs['I16']],'tps'))
compare(read(R/'I16-previous-tps5.json'),score(cs,[obs['I16']],'tps'))
allrows=load_gcps(R/'retained-diagnostic-review.csv');compare(read(R/'retained-diagnostics.json'),score([p for p in allrows if p.role=='control'],[p for p in allrows if p.role=='check'],'tps'))
assert read(R/'decision.json')['post_decision_fresh_check_count']==0
print('12 metric sets replayed; original source-crop hashes, exact reference vertices, nightly provenance and reserved-check isolation verified.')
