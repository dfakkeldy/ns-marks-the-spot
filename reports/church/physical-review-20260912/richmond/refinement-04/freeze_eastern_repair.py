"""Promote the verified isolated eastern interior lake after recording its failed check."""
import sys,json
from pathlib import Path
from dataclasses import replace
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'refinement-03'))
from freeze_western_repair import digest,score,write_csv,load_gcps
prev=HERE.parent/'refinement-03';points=load_gcps(prev/'richmond-refined-v3.csv');old=[p for p in points if p.role=='control'];g=next(p for p in points if p.label=='G04');controls=old+[replace(g,role='control')];checks=[p for p in points if p.role=='check' and p.label!='G04']
assert len(controls)==9 and len(checks)==14
observation=next(p for p in json.loads((prev/'fresh-checks.json').read_text())['points'] if p['id']=='G04')
(HERE/'control-promotion.json').write_text(json.dumps(dict(promoted_observation=observation,prior_scores_sha256=digest(prev/'fresh-scores.json'),role_change='G04 becomes a control after its 831 m failed validation revealed unsupported eastern distortion. Coordinates unchanged. All preceding checks are diagnostic from this stage forward; G04 is excluded from every comparison.'),indent=2)+'\n')
nine=controls
second=next(p for p in points if p.label=='G05')
controls=nine+[replace(second,role='control')]
checks=[p for p in checks if p.label!='G05']
second_observation=next(p for p in json.loads((prev/'fresh-checks.json').read_text())['points'] if p['id']=='G05')
(HERE/'second-control-promotion.json').write_text(json.dumps(dict(promoted_observation=second_observation,reason='The nine-control trial overshot Peebles Lake by 806 m. Both independently identified lakes anchor different eastern areas; no coordinates changed. The rejected nine-control trial and its fourteen-check result remain separate.',uncertainty_ground_m=150),indent=2)+'\n')
r=dict(check_status='Same thirteen diagnostics, excluding G04 and G05 from every model',models={'eight-tps':score(old,checks),'nine-tps':score(nine,checks),'ten-affine':score(controls,checks,'affine'),'ten-tps':score(controls,checks)},geographic_acceptance=False)
write_csv(HERE/'frozen-fit.csv',controls+checks);r['frozen_fit_sha256']=digest(HERE/'frozen-fit.csv');r['selected_model']='ten-tps'
(HERE/'repair-diagnostics.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:{q:v for q,v in m.items() if q!='points'} for k,m in r['models'].items()},indent=2))
