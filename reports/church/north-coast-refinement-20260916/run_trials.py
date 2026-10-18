"""Bounded comparison on pre-existing diagnostics; I16 is never loaded here."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('reports/church/target-refinement-20260913').resolve()))
from score_models import score
from tools.church.gcps import load_gcps,GroundControlPoint
R=Path(__file__).resolve().parent
old=Path('reports/church/inverness-north-continuation-20260914/north-tip-trial')
def save(name,v): (R/name).write_text(json.dumps(v,indent=2)+'\n')
cs=load_gcps(R/'trials/tps5-controls.csv'); diag=[p for p in load_gcps(old/'diagnostic-review.csv') if p.role=='check']
o=json.loads((R/'observations/I17.json').read_text()); p=GroundControlPoint(*o['pixel_xy'],*o['lonlat'],'check','I17')
first=score(cs,[p],'tps');save('I17-first-tps5.json',first)
print('I17 first TPS5',first['rms_ground_m'])
results={}
for name in ['tps5','plus-calumruadh','plus-presquile','plus-both']:
 cs=load_gcps(R/f'trials/{name}-controls.csv')
 for method in ['affine','tps']:
  key=f'{name}-{method}';results[key]=score(cs,diag,method);print(key,results[key]['rms_ground_m'],[(p['label'],p['error_ground_m']) for p in results[key]['points']])
save('trial-results.json',results)
