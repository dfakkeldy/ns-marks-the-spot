"""Leave-one-control-out diagnostic sensitivity; never fresh validation."""
import sys,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'refinement-03'))
from freeze_western_repair import load_gcps,score,digest
points=load_gcps(HERE/'frozen-fit.csv');c=[p for p in points if p.role=='control'];q=[p for p in points if p.role=='check']
trials=[]
for p in c:
 try:trials.append(dict(omitted=p.label,solved=True,diagnostics=score([x for x in c if x.label!=p.label],q)))
 except Exception as e:trials.append(dict(omitted=p.label,solved=False,error=str(e)))
r=dict(fit_csv_sha256=digest(HERE/'frozen-fit.csv'),scope='Diagnostic leave-one-out stability, not fresh validation. No control removed from the delivered fit.',trials=trials)
(HERE/'control-sensitivity.json').write_text(json.dumps(r,indent=2)+'\n');print([(x['omitted'],round(x['diagnostics']['rms_ground_m'],1)) for x in trials if x['solved']])
