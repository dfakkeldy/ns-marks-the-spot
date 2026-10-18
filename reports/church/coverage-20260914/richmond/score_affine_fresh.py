"""Preserve first checks of the separately frozen affine14 candidate."""
import hashlib
import json
from pathlib import Path
import sys
from shapely.geometry import MultiPoint, Point
from tools.church.gcps import GroundControlPoint, load_gcps

HERE=Path(__file__).resolve().parent
REPORTS=HERE.parents[1]
sys.path.insert(0,str(REPORTS/'target-refinement-20260913'))
sys.path.insert(0,str(REPORTS/'physical-review-20260912/richmond/refinement-03'))
from score_models import score
from freeze_western_repair import write_csv

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def point(p):
    return GroundControlPoint(*p['pixel_xy'],*p['lonlat'],'check',p['id'])

def main():
    id=sys.argv[1]
    path=HERE/'affine14-fresh'/f'{id}-observation.json'
    output=path.with_name(f'{id}-first.json')
    assert not output.exists(), 'Never overwrite a first score'
    freeze=json.loads((HERE/'affine14-freeze.json').read_text())
    controls=load_gcps(HERE/'affine14-controls.csv')
    assert digest(HERE/'affine14-controls.csv')==freeze['control_csv_sha256']
    p=point(json.loads(path.read_text()))
    oldchecks=[p for p in load_gcps(REPORTS/'target-refinement-20260913/richmond/distributed-14-tps.csv') if p.role=='check']
    oldchecks += [point(p) for p in json.loads((REPORTS/'target-refinement-20260913/richmond/fresh-six-observations.json').read_text())['points']]
    oldchecks += [point(json.loads(p.read_text())) for p in HERE.glob('R*-observation.json')]
    assert len(oldchecks)==28
    assert p.label not in {q.label for q in oldchecks+controls}
    assert (p.lon,p.lat) not in {(q.lon,q.lat) for q in oldchecks+controls}
    v4=[p for p in load_gcps(REPORTS/'physical-review-20260912/richmond/refinement-04/frozen-fit.csv') if p.role=='control']
    hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in controls]).convex_hull
    result=dict(phase='First fresh check after affine14 selection and freeze; no tuning',affine_freeze_sha256=digest(HERE/'affine14-freeze.json'),observation_sha256=digest(path),affine14=score(controls,[p],'affine'),v4_same_feature=score(v4,[p],'tps'),failed_tps14_same_feature=score(controls,[p],'tps'),inside_source_control_hull=hull.covers(Point(p.pixel_x,p.pixel_y)),geographic_acceptance=False)
    output.write_text(json.dumps(result,indent=2)+'\n')
    fresh=[point(json.loads(p.read_text())) for p in sorted((HERE/'affine14-fresh').glob('*-observation.json'))]
    write_csv(HERE/'affine14-fresh-validation.csv',controls+fresh)
    print(json.dumps(result,indent=2))

if __name__=='__main__':
    main()
