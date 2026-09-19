"""Score excluded physical checks with geodesic ground distances (never fit them)."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from pyproj import Transformer, Geod

def score(fit, checks):
    matrix = np.asarray(fit['matrix'])
    controls = fit['points']
    assert not {tuple(p['pixel_xy']) for p in controls} & {tuple(p['pixel_xy']) for p in checks}
    assert not {tuple(p['lonlat']) for p in controls} & {tuple(p['lonlat']) for p in checks}
    inverse = Transformer.from_crs(fit['crs'], 4326, always_xy=True)
    geod = Geod(ellps='WGS84')
    rows = []
    for point in checks:
        xy = np.array([*point['pixel_xy'], 1]) @ matrix
        predicted = inverse.transform(*xy)
        azimuth, _, distance = geod.inv(*point['lonlat'], *predicted)
        rows.append(dict(point, predicted_lonlat=predicted, error_ground_m=distance,
                         east_ground_m=distance*np.sin(np.deg2rad(azimuth)),
                         north_ground_m=distance*np.cos(np.deg2rad(azimuth))))
    errors = np.array([p['error_ground_m'] for p in rows])
    return dict(count=len(rows), rms_ground_m=float(np.sqrt(np.mean(errors**2))),
                median_ground_m=float(np.median(errors)), p95_ground_m=float(np.percentile(errors,95)),
                max_ground_m=float(errors.max()), p95_method='numpy linear empirical percentile',
                mean_east_ground_m=float(np.mean([p['east_ground_m'] for p in rows])),
                mean_north_ground_m=float(np.mean([p['north_ground_m'] for p in rows])), points=rows)

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fit', type=Path);parser.add_argument('checks', type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args();fit=json.loads(args.fit.read_text());checkdata=json.loads(args.checks.read_text())
    result=score(fit,checkdata['points']);result['fit_sha256']=hashlib.sha256(args.fit.read_bytes()).hexdigest()
    result['checks_sha256']=hashlib.sha256(args.checks.read_bytes()).hexdigest();result['status']=checkdata['status']
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print({k:v for k,v in result.items() if k!='points'})
