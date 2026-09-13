import sys,json
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE.parents[1]/'physical-review-20260912/richmond/refinement-03'))
from freeze_western_repair import score,write_csv,load_gcps,digest
points=load_gcps(HERE/'physical-trial.csv');cs=[p for p in points if p.role=='control'];new=[p for p in points if p.role=='check'];old=load_gcps(HERE/'july-checks.csv');base=[p for p in load_gcps(Path('tools/church/gcps/victoria-northwest.csv')) if p.role=='control']
r=dict(fit_sha256=digest(HERE/'physical-trial.csv'),control_count=3,check_status='Two historical North Pond diagnostics + one pre-reserved new Lake of Islands check; combined score is diagnostic model comparison, not fresh validation.',models={name:score(c,old+new,method) for name,c,method in [('graticule-tps',base,'tps'),('physical-affine',cs,'affine')]},first_new_check_affine=score(cs,new,'affine'),geographic_acceptance=False)
(HERE/'comparison.json').write_text(json.dumps(r,indent=2)+'\n');write_csv(HERE/'diagnostic-review.csv',cs+old+new);print(json.dumps(r,indent=2))
