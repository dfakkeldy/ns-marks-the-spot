"""Record each reviewed check once, preserving the prior frozen validation phases."""
import hashlib
import json
from pathlib import Path
import sys
from shapely.geometry import MultiPoint,Point
from tools.church.gcps import GroundControlPoint,load_gcps

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
    path=HERE/'observations'/f'{id}.json'
    output=HERE/'first-results'/f'{id}.json'
    assert not output.exists(), 'Preserve every first result'
    plan=json.loads((HERE/'phase-plan.json').read_text())
    control_path=(HERE/plan['controls_path']).resolve()
    assert digest(control_path)==plan['control_csv_sha256']
    freeze=control_path.parent/'affine14-freeze.json'
    assert digest(freeze)==plan['affine_freeze_sha256']
    controls=load_gcps(control_path)
    previous=[p for p in load_gcps(control_path.parent/'affine14-fresh-validation.csv') if p.role=='check']
    diagnostic=[p for p in load_gcps(control_path.parent/'affine14-diagnostic-review.csv') if p.role=='check']
    assert len(controls)==14 and len(previous)==6 and len(diagnostic)==28
    existing=[point(json.loads(f.read_text())) for f in (HERE/'observations').glob('R*.json') if f!=path and (HERE/'first-results'/f.name).exists()]
    p=point(json.loads(path.read_text()))
    assert p.label not in {q.label for q in controls+previous+diagnostic+existing}
    assert (p.lon,p.lat) not in {(q.lon,q.lat) for q in controls+previous+diagnostic+existing}
    v4=[p for p in load_gcps(REPORTS/'physical-review-20260912/richmond/refinement-04/frozen-fit.csv') if p.role=='control']
    hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in controls]).convex_hull
    result=dict(phase='First additional fresh check against unchanged affine14; no tuning',observation_sha256=digest(path),affine_freeze_sha256=digest(freeze),affine14=score(controls,[p],'affine'),v4_same_feature=score(v4,[p],'tps'),failed_tps14_same_feature=score(controls,[p],'tps'),inside_source_control_hull=hull.covers(Point(p.pixel_x,p.pixel_y)),distance_to_source_control_hull_native_px=hull.distance(Point(p.pixel_x,p.pixel_y)),geographic_acceptance=False)
    output.write_text(json.dumps(result,indent=2)+'\n')
    paths=[p for p in sorted((HERE/'observations').glob('R*.json')) if (HERE/'first-results'/p.name).exists()]
    added=[point(json.loads(p.read_text())) for p in paths]
    write_csv(HERE/'additional-validation.csv',controls+added)
    write_csv(HERE/'cumulative-validation.csv',controls+previous+added)
    summary=dict(phase='Additional phase and cumulative first-six-plus-additional checks; identical frozen affine, no tuning',new_observations=[dict(path=str(p.relative_to(HERE)),sha256=digest(p)) for p in paths],previous_fresh_csv_sha256=digest(control_path.parent/'affine14-fresh-validation.csv'),affine_freeze_sha256=digest(freeze),additional=score(controls,added,'affine'),cumulative=score(controls,previous+added,'affine'),v4_cumulative_same_features=score(v4,previous+added,'tps'),geographic_acceptance=False)
    summary_path=HERE/'first-results'/f'phase-{len(added):02}.json'
    assert not summary_path.exists()
    summary_path.write_text(json.dumps(summary,indent=2)+'\n')
    print(id,{name:round(result[name]['rms_ground_m'],2) for name in ['affine14','v4_same_feature','failed_tps14_same_feature']})
    print('Cumulative',summary['cumulative']['count'],summary['cumulative']['rms_ground_m'])

if __name__=='__main__':
    main()
