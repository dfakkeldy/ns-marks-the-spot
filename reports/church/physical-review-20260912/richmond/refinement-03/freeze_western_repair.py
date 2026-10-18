"""Promote the previously verified F02 islet; preserve its first failed validation."""
import csv
import hashlib
import json
import math
import subprocess
from dataclasses import replace
from pathlib import Path
import numpy as np
from tools.church.gcps import load_gcps
from tools.church.geometry import mercator_to_lonlat

HERE = Path(__file__).resolve().parent
PREVIOUS = HERE.parent / 'refinement-02'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def score(controls, checks, method='tps'):
    assert not {(p.lon, p.lat) for p in controls} & {(p.lon, p.lat) for p in checks}
    args = []
    for p in controls:
        args += ['-gcp', str(p.pixel_x), str(p.pixel_y), *map(str, p.mercator)]
    result = subprocess.check_output(['gdaltransform', *(['-tps'] if method == 'tps' else ['-order', '1']), *args], input=''.join(f'{p.pixel_x} {p.pixel_y}\n' for p in checks), text=True)
    rows = []
    for p, line in zip(checks, result.splitlines(), strict=True):
        lon, lat = mercator_to_lonlat(*map(float, line.split()[:2]))
        east = 6371008.8 * math.radians(lon-p.lon) * math.cos(math.radians((lat+p.lat)/2))
        north = 6371008.8 * math.radians(lat-p.lat)
        rows.append(dict(label=p.label, east_ground_m=east, north_ground_m=north, error_ground_m=math.hypot(east, north)))
    errors = np.array([p['error_ground_m'] for p in rows])
    en = np.array([[p['east_ground_m'], p['north_ground_m']] for p in rows])
    return dict(count=len(rows), points=rows, rms_ground_m=float(np.sqrt(np.mean(errors**2))), median_ground_m=float(np.median(errors)), p95_ground_m=float(np.percentile(errors,95)), max_ground_m=float(errors.max()), mean_east_ground_m=float(en[:,0].mean()), mean_north_ground_m=float(en[:,1].mean()), scatter_rms_ground_m=float(np.sqrt(np.mean(np.sum((en-en.mean(axis=0))**2,axis=1)))), distance='Equirectangular horizontal ground distance, mean latitude cosine, sphere radius 6371008.8 m; warped minus reference', percentile='NumPy linear empirical 95th percentile; not a confidence interval')

def write_csv(path, points):
    with path.open('w',newline='') as f:
        w=csv.writer(f,lineterminator='\n')
        w.writerow(['pixel_x','pixel_y','lon','lat','role','label'])
        for p in points:
            w.writerow([p.pixel_x,p.pixel_y,p.lon,p.lat,p.role,p.label])

def main():
    points=load_gcps(PREVIOUS/'richmond-refined-v2.csv')
    old=[p for p in points if p.role=='control']
    promoted=next(p for p in points if p.label=='F02')
    controls=old+[replace(promoted,role='control')]
    checks=[p for p in points if p.role=='check' and p.label!='F02']
    observation=next(p for p in json.loads((PREVIOUS/'fresh-checks.json').read_text())['points'] if p['id']=='F02')
    record=dict(promoted_observation=observation, prior_fresh_scores_sha256=digest(PREVIOUS/'fresh-scores.json'), role_change='F02 becomes a control because it is a verified physical islet beyond the prior western hull. Its original 324.8995 m validation discrepancy remains in refinement-02. All remaining earlier checks are now diagnostic, including F01/F03/F04. No coordinates changed.', objective=dict(rms_ground_m=200, fixed_acceptance_gate_rms_ground_m=400, fixed_p95_ground_m=900, fixed_max_ground_m=1500, fixed_minimum_fresh_checks=6, coverage_required=True))
    (HERE/'control-promotion.json').write_text(json.dumps(record,indent=2)+'\n')
    result=dict(check_status='Same nine diagnostics; excludes the promoted F02 in every model', models={name:score(cs,checks,method) for name,cs,method in [('seven-tps',old,'tps'),('eight-affine',controls,'affine'),('eight-tps',controls,'tps')]}, geographic_acceptance=False)
    write_csv(HERE/'frozen-fit.csv',controls+checks)
    result['frozen_fit_sha256']=digest(HERE/'frozen-fit.csv')
    result['selected_model']='eight-tps'
    (HERE/'repair-diagnostics.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__=='__main__':
    main()
