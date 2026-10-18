"""Replay active reported scores and check immutable accepted-baseline input identities."""
import json,sys,math
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];sys.path.insert(0,str(HERE.parent/'physical-review-20260912/richmond/refinement-03'))
from freeze_western_repair import score,load_gcps,digest

def controls(path):return [p for p in load_gcps(path) if p.role=='control']
def checks(path):return [p for p in load_gcps(path) if p.role=='check']
def read(path):return json.loads(path.read_text())
def compare(actual,expected):
 assert actual['count']==expected['count']
 for k,v in actual.items():
  if isinstance(v,(int,float)):assert math.isclose(v,expected[k],abs_tol=.001,rel_tol=0),(k,v,expected[k])
 assert [p['label'] for p in actual['points']]==[p['label'] for p in expected['points']]
 for a,e in zip(actual['points'],expected['points']):
  assert abs(a['error_ground_m']-e['error_ground_m'])<.001
cases=[]
r=HERE/'richmond';old=HERE.parent/'physical-review-20260912/richmond/refinement-04';cases.append(('Richmond expanded nine diagnostics',controls(old/'frozen-fit.csv'),checks(old/'fresh-checks.csv')+checks(r/'new-checks.csv'),'tps',read(r/'comparison.json')['unchanged_v4_expanded_nine']))
r=HERE/'inverness-north';p=read(r/'candidate-I12.json');from tools.church.gcps import GroundControlPoint
cases.append(('Inverness north fresh I12',controls(r/'physical-trial.csv'),[GroundControlPoint(*p['pixel_xy'],*p['lonlat'],'check','I12')],'affine',read(r/'fresh-I12-score.json')['metrics']))
r=HERE/'victoria-northwest';cases.append(('Victoria northwest four-control diagnostics',controls(r/'four-control-trial.csv'),checks(r/'four-control-trial.csv'),'affine',read(r/'western-support-trial.json')['models']['four-affine']))
r=HERE/'victoria-main';cases.append(('Victoria main physical diagnostics',controls(r/'physical-trial.csv'),checks(r/'physical-trial.csv'),'affine',read(r/'comparison.json')['models']['physical-affine']))
r=HERE/'inverness-south';base=read(r/'baseline-replay.json');assert digest(ROOT/'tools/church/gcps/inverness-south.csv')==base['control_csv_sha256'];assert digest(ROOT/'tools/church/checks/inverness-south.csv')==base['check_csv_sha256'];assert digest(r/'historical-checks.csv')==base['check_csv_sha256']
cases.extend([('Inverness south accepted-baseline replay',controls(ROOT/'tools/church/gcps/inverness-south.csv'),checks(r/'historical-checks.csv'),'tps',base['metrics']),('Inverness south physical diagnostics',controls(r/'physical-trial.csv'),checks(r/'physical-trial.csv'),'affine',read(r/'comparison.json')['models']['physical-affine']),('Inverness south fresh inland outlet',controls(r/'physical-trial.csv'),checks(r/'fresh-check.csv'),'affine',read(r/'fresh-score.json')['metrics'])])
results=[]
for name,cs,ps,method,expected in cases:
 assert not {(p.lon,p.lat) for p in cs}&{(p.lon,p.lat) for p in ps},name
 got=score(cs,ps,method);compare(got,expected);results.append(dict(name=name,controls=len(cs),checks=len(ps),method=method,rms_ground_m=got['rms_ground_m'],replayed=True))
assert len(controls(HERE/'cape-breton/island-observations.csv'))==1
assert len(checks(HERE/'cape-breton/island-observations.csv'))==1
assert read(r/'explicit-affine-coverage.json')['passed']
result=dict(replays=results,original_accepted_south_inputs_unchanged=True,cape_breton_no_transform=True,geographic_acceptance=False,scope='Numerical/input integrity only; does not replace correspondence, rendered geography or coverage assessment')
(HERE/'verification-summary.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
