"""Replay frozen Richmond trials, source frames, first checks and provenance.

Run from repository root with PYTHONPATH=. and GIS Python. External source crops
and reference files are intentionally required for the measurement audit.
"""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

import numpy as np
from shapely.geometry import MultiPoint, Point, Polygon
from tools.church.gcps import GroundControlPoint, load_gcps
from tools.church.landmarks import polygon_centroid
from score_models import score

HERE = Path(__file__).resolve().parent
R = HERE / 'richmond'
CACHE = Path('/Users/dfakkeldy/Downloads/church-target-refinement-20260913')
PRIOR = HERE.parent / 'physical-review-20260912/richmond/refinement-04/frozen-fit.csv'
COMMIT = '09e3adf467b6d684934303fae2306cbbcd390263'
ROOT = HERE.parents[2]

def read(path):
    return json.loads(path.read_text())

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def compare(actual, expected):
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys()
        for key in expected:
            compare(actual[key], expected[key])
    elif isinstance(expected, list):
        assert len(actual) == len(expected)
        for a, e in zip(actual, expected):
            compare(a, e)
    elif isinstance(expected, float):
        assert math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-5), (actual, expected)
    else:
        assert actual == expected, (actual, expected)

def split(path):
    points = load_gcps(path)
    return ([p for p in points if p.role == 'control'],
            [p for p in points if p.role == 'check'])

v4, _ = split(PRIOR)
cs = load_gcps(R / 'candidate-controls.csv')
freeze = read(R / 'candidate-freeze.json')
assert digest(R / 'candidate-controls.csv') == freeze['control_csv_sha256']
assert len(cs) == 14 and all(p.role == 'control' for p in cs)
assert len({(p.lon, p.lat) for p in cs}) == 14
# Frozen inputs resolve from a landed commit on nightly history.
subprocess.run(['git', 'merge-base', '--is-ancestor', COMMIT, 'origin/nightly'], check=True)
for path in [PRIOR, HERE.parent/'physical-review-20260913/richmond/diagnostic-review.csv',
             HERE.parent/'distributed-review-20260913/richmond/fresh-validation-review.csv']:
    original = subprocess.check_output(['git', 'show', f'{COMMIT}:{path.relative_to(ROOT)}'])
    assert original == path.read_bytes()

trials = read(R / 'support-trials.json')
old = split(HERE.parent/'physical-review-20260913/richmond/diagnostic-review.csv')[1]
new = split(HERE.parent/'distributed-review-20260913/richmond/fresh-validation-review.csv')[1]
compare(score(v4, old + new, 'tps'), trials['v4_all_24_diagnostics'])
replays = 1
for trial in trials['trials']:
    path = R / (trial['name'] + '.csv')
    assert digest(path) == trial['csv_sha256']
    controls, checks = split(path)
    assert not set(trial['promoted_labels']) & {p.label for p in checks}
    for key, points in [('same_check_set', checks), ('common_old_22', old)]:
        compare(score(v4, points, 'tps'), trial[key]['v4'])
        compare(score(controls, points, 'tps'), trial[key]['trial'])
        replays += 2

trial_cs, diagnostic = split(R / 'distributed-14-tps.csv')
assert trial_cs == cs and len(diagnostic) == 20
promoted = freeze['promoted']
assert {p.label for p in cs} - {p.label for p in v4} == set(promoted)
for p in cs:
    original = next(q for q in v4 + old + new if q.label == p.label)
    assert (p.pixel_x,p.pixel_y,p.lon,p.lat) == (original.pixel_x,original.pixel_y,original.lon,original.lat)
assert not {(p.lon,p.lat) for p in diagnostic} & {(p.lon,p.lat) for p in cs}
distributed = read(R / 'distributed-14-results.json')
assert digest(R/'distributed-trial-plan.json') == distributed['plan_sha256']
assert digest(R/'distributed-14-tps.csv') == distributed['csv_sha256']
for name, controls in [('v4',v4), ('distributed14',cs)]:
    compare(score(controls, diagnostic, 'tps'), distributed['models'][name])
    replays += 1
for model, result in read(R/'supported-model-comparison.json')['models'].items():
    compare(score(cs, diagnostic, model), result)
    replays += 1

reference = Path('/Users/dfakkeldy/Downloads/church-refinement-04/review-water-lines.geojson')
assert digest(reference) == read(R/'terrain-preview-inputs.json')['water_sha256']
features = {f['id']:f for f in read(reference)['features']}
observations = read(R/'fresh-observations.json')['points']
checks = []
crop_names = ['R30','R31-native','R32','R33','R34-native','R35-barren-native']
for p, crop_name in zip(observations, crop_names, strict=True):
    frame = p['source_frame']
    assert frame['rotation'] == 0 and frame == read(CACHE/(crop_name+'-frame.json'))
    assert digest(CACHE/(crop_name+'.jpg')) == p['source_crop_sha256']
    source_point = p.get('source_display_pixel_xy')
    if source_point is None:
        assert Polygon(p['source_outline_display_pixels']).is_valid
        source_point = polygon_centroid(p['source_outline_display_pixels'])[:2]
    native = [frame['origin'][i] + source_point[i]*frame['extent'][i]/frame['display'][i] for i in range(2)]
    assert np.allclose(native,p['pixel_xy'],atol=1e-8,rtol=0)
    selected = [features[id] for id in p['reference_feature_ids']]
    if 'reference_vertex' in p:
        vertex = p['reference_vertex']
        expected = features[vertex['feature_id']]['geometry']['coordinates'][vertex['vertex']]
    else:
        ring = p['modern_ring']
        assert Polygon(ring).is_valid
        vertices = {tuple(v) for f in selected for v in f['geometry']['coordinates']}
        assert all(tuple(v) in vertices for v in ring)
        expected = polygon_centroid(ring)[:2]
    assert np.allclose(expected,p['lonlat'],atol=1e-10,rtol=0)
    g = GroundControlPoint(*p['pixel_xy'],*p['lonlat'],'check',p['id'])
    checks.append(g)
    first = read(R/('fresh-'+p['id']+'-first.json'))
    assert first['candidate_sha256'] == freeze['control_csv_sha256']
    observation_path = R/('fresh-'+p['id']+'.json')
    if 'observation_sha256' in first:
        assert digest(observation_path) == first['observation_sha256']
        assert read(observation_path) == p
    compare(score(cs,[g],'tps'),first['metrics'])
    compare(score(v4,[g],'tps'),first['v4_same_feature'])
    replays += 2
assert split(R/'fresh-validation-review.csv') == (cs,checks)
for phase, n in [('four',4),('six',6)]:
    first = read(R/f'fresh-{phase}-first.json')
    frozen_obs = R/f'fresh-{phase}-observations.json'
    assert digest(frozen_obs) == first['observation_sha256']
    assert read(frozen_obs)['points'] == observations[:n]
    compare(score(cs,checks[:n],'tps'),first['metrics'])
    compare(score(v4,checks[:n],'tps'),first[f'v4_same_{phase}'])
    hull = MultiPoint([(p.pixel_x,p.pixel_y) for p in cs]).convex_hull
    assert {p.label:hull.covers(Point(p.pixel_x,p.pixel_y)) for p in checks[:n]} == first['source_hull']
    replays += 2

receipt = read(R/'artifact-receipt.json')
assert receipt['control_csv_sha256'] == freeze['control_csv_sha256']
assert receipt['boundary_sha256'] == freeze['boundary_sha256']
assert digest(HERE.parent/'physical-review-20260912/richmond/content-boundary.json') == freeze['boundary_sha256']
coverage = read(R/'coverage.json')
assert coverage['raster_sha256'] == receipt['output_sha256']
assert coverage['passed'] and coverage['transparent_interior_cells'] == 0
for raster in read(R/'terrain-preview-inputs.json')['rasters']:
    assert digest(Path(raster['raster'])) == raster['raster_sha256']
print(json.dumps(dict(numerical_replays=replays,source_and_reference_observations=len(observations),frozen_phases=['four','six'],preserved_landed_inputs=True,geographic_acceptance=False),indent=2))
