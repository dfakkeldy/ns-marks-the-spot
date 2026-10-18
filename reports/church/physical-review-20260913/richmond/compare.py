import sys,json
from pathlib import Path
from dataclasses import replace
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'physical-review-20260912/richmond/refinement-03'))
from freeze_western_repair import score,load_gcps,write_csv,digest
HERE=Path(__file__).resolve().parent;OLD=HERE.parents[1]/'physical-review-20260912/richmond/refinement-04'
old=load_gcps(OLD/'frozen-fit.csv');cs=[p for p in old if p.role=='control'];diagnostics=[p for p in old if p.role=='check'];h=load_gcps(OLD/'fresh-checks.csv');new=load_gcps(HERE/'new-checks.csv')
assert digest(OLD/'frozen-fit.csv')=='a38b2074b7c5e525b684b02a8d848b7be6f8299bdcc53647afdb1dce09d800be'
promoted=replace(new[0],role='control');checks=diagnostics+h+new[1:];trial=cs+[promoted]
r=dict(original_fit_sha256=digest(OLD/'frozen-fit.csv'),new_observation_sha256=digest(HERE/'new-checks.json'),initial_results_preserved='first-observations.json; first-scores.json',correction='R23 original outline included narrow incoming eastern stream beyond the basin. Native review corrected closure before any fit trial; original 228.18 m preserved. Modern coordinates and all controls unchanged. R23 is diagnostic; no fresh claim for corrected outline.',validation_status='H01-H06 and R21-R23 now diagnostic for refinement trials. Their initial post-freeze results remain in their original reports.',unchanged_v4_expanded_nine=score(cs,h+new),same_21_diagnostics=dict(v4=score(cs,checks),trial_R21_control=score(trial,checks)),geographic_acceptance=False)
write_csv(HERE/'trial-R21-control.csv',trial+checks);write_csv(HERE/'diagnostic-review.csv',cs+diagnostics+h+new)
(HERE/'comparison.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:({n:{kk:vv for kk,vv in v.items() if kk!='points'} for n,v in val.items()} if k=='same_21_diagnostics' else {kk:vv for kk,vv in val.items() if kk!='points'}) for k,val in r.items() if k in ['unchanged_v4_expanded_nine','same_21_diagnostics']},indent=2))
