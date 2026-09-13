"""Evaluate the frozen fit on the separately measured fresh checks."""
import csv,json,hashlib,importlib.util
from scipy.spatial import Delaunay
from pathlib import Path
from tools.church.gcps import load_gcps
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('replay',HERE.parent.parent/'replay_scores.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
manifest=json.loads((HERE/'fresh-checks.json').read_text());assert hashlib.sha256((HERE/'frozen-fit.csv').read_bytes()).hexdigest()==manifest['fit_sha256']
allpoints=load_gcps(HERE/'frozen-fit.csv');controls=[p for p in allpoints if p.role=='control'];fresh=load_gcps(HERE/'fresh-checks.csv');old=[p for p in load_gcps(HERE.parent/'refinement-01/richmond-refined.csv') if p.role=='control']
assert not {p.label for p in fresh}&{p.label for p in allpoints}
res=dict(fit_csv_sha256=manifest['fit_sha256'],fresh_observations_sha256=hashlib.sha256((HERE/'fresh-checks.json').read_bytes()).hexdigest(),fresh_check_count=len(fresh),scope=manifest['coverage_limit'],fit_was_frozen_before_correspondence_selection=True,fresh_checks_used_for_fitting_or_model_selection=False,baseline_six_control_tps=r.score(old,fresh,'tps'),frozen_seven_control_tps=r.score(controls,fresh,'tps'),geographic_acceptance=False)
hull=Delaunay([[p.pixel_x,p.pixel_y] for p in controls])
res['source_control_hull']={p.label:bool(hull.find_simplex([[p.pixel_x,p.pixel_y]])[0]>=0) for p in fresh}
(HERE/'fresh-scores.json').write_text(json.dumps(res,indent=2)+'\n')
with (HERE/'richmond-refined-v2.csv').open('w',newline='') as f:
 w=csv.writer(f,lineterminator='\n');w.writerow(['pixel_x','pixel_y','lon','lat','role','label'])
 for p in allpoints+fresh:w.writerow([p.pixel_x,p.pixel_y,p.lon,p.lat,p.role,p.label])
print(json.dumps(res,indent=2))

with (HERE/'fresh-validation-review.csv').open('w',newline='') as f:
 w=csv.writer(f,lineterminator='\n');w.writerow(['pixel_x','pixel_y','lon','lat','role','label'])
 for p in controls+fresh:w.writerow([p.pixel_x,p.pixel_y,p.lon,p.lat,p.role,p.label])
