"""Bounded physical-control trials. Preserve first validation phases unchanged."""
import json,sys
from dataclasses import replace
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'physical-review-20260912/richmond/refinement-03'))
from freeze_western_repair import score,load_gcps,write_csv,digest
HERE=Path(__file__).resolve().parent;REPORTS=HERE.parents[1]
prior=REPORTS/'physical-review-20260913/richmond/diagnostic-review.csv'
new=REPORTS/'distributed-review-20260913/richmond/fresh-validation-review.csv'
cs=[p for p in load_gcps(prior) if p.role=='control'];old=[p for p in load_gcps(prior) if p.role=='check'];fresh=[p for p in load_gcps(new) if p.role=='check'];allchecks=old+fresh
assert len(cs)==10 and len(old)==22 and len(fresh)==2
assert len({(p.lon,p.lat) for p in allchecks})==24
trials=[]
for names in [('R26',),('R27',),('R26','R27')]:
 promoted=[replace(p,role='control') for p in fresh if p.label in names]
 checks=[p for p in allchecks if p.label not in names];controls=cs+promoted
 name='promote-'+'-'.join(names);path=HERE/(name+'.csv');write_csv(path,controls+checks)
 trials.append(dict(name=name,promoted_labels=list(names),coordinates_unchanged=True,csv_sha256=digest(path),same_check_set=dict(v4=score(cs,checks),trial=score(controls,checks)),common_old_22=dict(v4=score(cs,old),trial=score(controls,old))))
r=dict(frozen_input_commit='09e3adf467b6d684934303fae2306cbbcd390263',input_sha256={str(p.relative_to(REPORTS)):digest(p) for p in [prior,new]},validation_phase='All 24 excluded physical features are now diagnostic for these trials. Original first fresh phases remain unchanged in their frozen reports; no pooled fresh claim.',selection_requirement='Improve same diagnostics including regional tails without unsupported folds/edge distortion; fresh validation must follow a selected freeze.',v4_all_24_diagnostics=score(cs,allchecks),trials=trials,geographic_acceptance=False)
(HERE/'support-trials.json').write_text(json.dumps(r,indent=2)+'\n')
for p in trials:print(p['name'],{k:{m:round(v[m],2) for m in ['rms_ground_m','p95_ground_m','max_ground_m']} for k,v in p['same_check_set'].items()})
