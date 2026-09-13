import json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE.parents[1]/'physical-review-20260912/richmond/refinement-03'))
from freeze_western_repair import score,load_gcps,digest
ps=load_gcps(HERE/'physical-trial.csv');cs=[p for p in ps if p.role=='control'];checks=[p for p in ps if p.role=='check'];original=load_gcps(HERE/'original-graticule.csv');corrected=load_gcps(Path('tools/church/gcps/victoria-main.csv'))
r=dict(observations_sha256=digest(HERE/'observations.json'),frozen_fit_sha256=digest(HERE/'physical-trial.csv'),check_status='Four pre-reserved checks; first scores on each model preserved. Model comparisons make this set diagnostic for selected subsequent fit. Two channel checks correlated, Bird Island check near control.',models={n:score(c,checks,m) for n,c,m in [('original-graticule-tps',original,'tps'),('corrected-graticule-tps',corrected,'tps'),('physical-affine',cs,'affine'),('physical-tps',cs,'tps')]},geographic_acceptance=False)
(HERE/'comparison.json').write_text(json.dumps(r,indent=2)+'\n');print({n:{k:v for k,v in m.items() if k!='points'} for n,m in r['models'].items()})
