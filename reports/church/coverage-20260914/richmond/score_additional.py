"""Score a crosshair-reviewed observation once; never overwrite its first result."""
import hashlib
import json
from pathlib import Path
import sys

from tools.church.gcps import GroundControlPoint, load_gcps

HERE = Path(__file__).resolve().parent
REPORTS = HERE.parents[1]
sys.path.insert(0, str(REPORTS/'target-refinement-20260913'))
sys.path.insert(0, str(REPORTS/'physical-review-20260912/richmond/refinement-03'))
from score_models import score
from freeze_western_repair import write_csv

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def point(observation):
    return GroundControlPoint(*observation['pixel_xy'], *observation['lonlat'], 'check', observation['id'])

def main():
    id = sys.argv[1]
    path = HERE/f'{id}-observation.json'
    first = HERE/f'{id}-first.json'
    assert not first.exists(), f'Preserve existing first result: {first}'
    observation = json.loads(path.read_text())
    controls_path = REPORTS/'target-refinement-20260913/richmond/candidate-controls.csv'
    assert digest(controls_path) == json.loads((HERE/'phase-plan.json').read_text())['candidate_csv_sha256']
    controls = load_gcps(controls_path)
    v4 = [p for p in load_gcps(REPORTS/'physical-review-20260912/richmond/refinement-04/frozen-fit.csv') if p.role=='control']
    p = point(observation)
    result = dict(phase='Additional post-freeze physical check; unchanged candidate14, no tuning',
                  observation_sha256=digest(path), candidate_csv_sha256=digest(controls_path),
                  candidate14=score(controls,[p],'tps'), v4=score(v4,[p],'tps'), geographic_acceptance=False)
    first.write_text(json.dumps(result,indent=2)+'\n')
    additional = [point(json.loads(path.read_text())) for path in sorted(HERE.glob('R*-observation.json'))]
    write_csv(HERE/'additional-validation-review.csv',controls+additional)
    print(json.dumps(result,indent=2))

if __name__ == '__main__':
    main()
