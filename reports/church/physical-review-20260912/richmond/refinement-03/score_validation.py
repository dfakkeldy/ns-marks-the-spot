"""Score every new observation against the frozen western repair; no fitting."""
import json
from scipy.spatial import Delaunay
from freeze_western_repair import HERE,digest,score,write_csv,load_gcps
m=json.loads((HERE/'fresh-checks.json').read_text());assert digest(HERE/'frozen-fit.csv')==m['fit_sha256']
points=load_gcps(HERE/'frozen-fit.csv');controls=[p for p in points if p.role=='control'];fresh=load_gcps(HERE/'fresh-checks.csv')
hull=Delaunay([[p.pixel_x,p.pixel_y] for p in controls])
r=dict(fit_csv_sha256=m['fit_sha256'],fresh_observations_sha256=digest(HERE/'fresh-checks.json'),validation_status='Initial six checks on frozen eight-control TPS, with disclosed G05 polygon correction after premature first score. Original result retained in initial-measurement; no model tuning in this stage.',fresh_checks_used_for_fitting_or_model_selection=False,metrics=score(controls,fresh),source_hull={p.label:bool(hull.find_simplex([[p.pixel_x,p.pixel_y]])[0]>=0) for p in fresh},geographic_acceptance=False)
(HERE/'fresh-scores.json').write_text(json.dumps(r,indent=2)+'\n')
write_csv(HERE/'fresh-validation-review.csv',controls+fresh)
write_csv(HERE/'richmond-refined-v3.csv',points+fresh)
print(json.dumps(r,indent=2))
