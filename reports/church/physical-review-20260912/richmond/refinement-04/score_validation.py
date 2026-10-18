"""Score every new observation against the frozen western repair; no fitting."""
import json
from scipy.spatial import Delaunay
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'refinement-03'))
from freeze_western_repair import digest,score,write_csv,load_gcps
m=json.loads((HERE/'fresh-checks.json').read_text());assert len(m['points'])==6;assert all(p['id'].startswith('H') for p in m['points']);assert digest(HERE/'frozen-fit.csv')==m['fit_sha256']
points=load_gcps(HERE/'frozen-fit.csv');controls=[p for p in points if p.role=='control'];fresh=load_gcps(HERE/'fresh-checks.csv')
hull=Delaunay([[p.pixel_x,p.pixel_y] for p in controls])
r=dict(fit_csv_sha256=m['fit_sha256'],fresh_observations_sha256=digest(HERE/'fresh-checks.json'),validation_status='Six fresh checks on frozen ten-control TPS; no subsequent tuning',fresh_checks_used_for_fitting_or_model_selection=False,metrics=score(controls,fresh),source_hull={p.label:bool(hull.find_simplex([[p.pixel_x,p.pixel_y]])[0]>=0) for p in fresh},geographic_acceptance=False)
(HERE/'fresh-scores.json').write_text(json.dumps(r,indent=2)+'\n')
write_csv(HERE/'fresh-validation-review.csv',controls+fresh)
write_csv(HERE/'richmond-refined-v4.csv',points+fresh)
print(json.dumps(r,indent=2))
