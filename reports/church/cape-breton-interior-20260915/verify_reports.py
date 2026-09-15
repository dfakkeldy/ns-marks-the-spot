"""Replay frozen model phases and validate the retained local evidence."""
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

import numpy as np
from shapely.geometry import MultiPoint, Point, shape
from tools.church.gcps import GroundControlPoint, load_gcps

R = Path(__file__).resolve().parent
OLD = R.parent / 'cape-breton-continuation-20260915'
CACHE = Path('/Users/dfakkeldy/Downloads/church-cape-breton-interior-20260915')
spec = importlib.util.spec_from_file_location('church_score', R.parent / 'target-refinement-20260913/score_models.py')
scorer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scorer)

def read(path):
    return json.loads(path.read_text())

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def compare(a, b):
    if isinstance(b, dict):
        for key, value in b.items():
            compare(a[key], value)
    elif isinstance(b, list):
        assert len(a) == len(b)
        for x, y in zip(a, b, strict=True):
            compare(x, y)
    elif isinstance(b, (int, float)):
        assert abs(a - b) < 1e-5, (a, b)
    else:
        assert a == b, (a, b)

base = load_gcps(OLD / 'affine3-controls.csv')
south = load_gcps(OLD / 'southern-support-trial/controls.csv')
five = load_gcps(R / 'selected-tps5/controls.csv')
six = load_gcps(R / 'selected-tps6/controls.csv')
checks = [p for p in load_gcps(R / 'interior-support-trial/diagnostic-review.csv') if p.role == 'check']
assert [p.label for p in checks] == ['CB04', 'CB09']
assert [p.label for p in five] == ['CB01', 'CB07', 'CB08', 'CB10', 'CB11']
assert [p.label for p in six] == ['CB01', 'CB07', 'CB08', 'CB10', 'CB11', 'CB12']
count = 0
for directory, rows in [
    ('interior-support-trial', [('affine3', base, 'affine'), ('affine4', south, 'affine'), ('tps4', south, 'tps'), ('affine5', five, 'affine'), ('tps5', five, 'tps')]),
    ('western-support-trial', [('tps5', five, 'tps'), ('affine6', six, 'affine'), ('tps6', six, 'tps')]),
]:
    expected = read(R / directory / 'model-comparison.json')['models']
    for name, controls, method in rows:
        compare(scorer.score(controls, checks, method), expected[name])
        count += 1
reference_path = Path('/Users/dfakkeldy/Downloads/church-review-20260913/cape-water-lines.geojson')
reference = {f['properties']['OBJECTID']: f for f in read(reference_path)['features']}
for name in ['CB11', 'CB12', 'CB13']:
    path = R / 'observations' / (name + '.json')
    p = read(path)
    frame = p['source_frame']
    assert frame['rotation'] == 0
    native = np.asarray(frame['origin']) + np.asarray(p['source_display_pixel_xy']) * np.asarray(frame['extent']) / np.asarray(frame['display'])
    assert np.allclose(native, p['pixel_xy'], atol=1e-9, rtol=0)
    assert digest(Path(p['source_crop_path'])) == p['source_crop_sha256']
    assert digest(reference_path) == p['reference_sha256']
    vertices = p.get('reference_vertices', [p.get('reference_vertex')])
    for vertex in vertices:
        f = reference[vertex['feature_id']]
        assert f['geometry']['coordinates'][vertex['vertex']][:2] == p['lonlat']
    point = GroundControlPoint(*p['pixel_xy'], *p['lonlat'], 'check', name)
    if name == 'CB11':
        result = read(R / 'CB11-prospective-assessment.json')
        phases = [('affine3', base, 'affine'), ('affine4', south, 'affine'), ('tps4', south, 'tps')]
        assert reference[126301]['properties']['FEAT_CODE'] == 'WALK20'
        polygon = shape(read(R / 'identity/grand-lake-identity-polygon.geojson')['geometry'])
        assert polygon.contains(Point(-59.95559, 45.959241))
        assert polygon.exterior.distance(Point(*p['lonlat'])) < 1e-12
        assert polygon.bounds[3] == p['lonlat'][1]
    else:
        result = read(R / (name + '-first.json'))
        number, controls = (5, five) if name == 'CB12' else (6, six)
        phases = [(f'tps{number}', controls, 'tps'), ('baseline_affine3', base, 'affine')]
        freeze_path = R / f'selected-tps{number}/freeze.json'
        assert digest(freeze_path) == result['freeze_sha256']
        assert read(freeze_path)['frozen_at'] < p['recorded_at']
        hull = MultiPoint([(q.pixel_x, q.pixel_y) for q in controls]).convex_hull
        assert hull.covers(Point(point.pixel_x, point.pixel_y)) == result['inside_control_hull']
    assert digest(path) == result['observation_sha256']
    for model, controls, method in phases:
        compare(scorer.score(controls, [point], method), result[model])
        count += 1
role = read(R / 'western-support-trial/role-history.json')
assert digest(R / 'CB12-first.json') == role['first_result_sha256']
assert digest(R / 'observations/CB12.json') == role['original_observation_sha256']
for number, subdir in [(5, 'rendered'), (6, 'tps6-rendered')]:
    directory = R / f'selected-tps{number}'
    freeze = read(directory / 'freeze.json')
    receipt = read(directory / 'artifact-receipt.json')
    coverage = read(directory / 'coverage.json')
    assert digest(directory / 'controls.csv') == freeze['controls_csv_sha256'] == receipt['controls_sha256']
    assert digest(directory / 'freeze.json') == receipt['freeze_sha256']
    assert digest(R / 'content-boundary.json') == freeze['boundary_sha256'] == receipt['boundary_sha256']
    assert digest(CACHE / subdir / f'cape-breton-tps{number}-review-20m.tif') == receipt['output_sha256'] == coverage['raster_sha256']
    assert receipt['orientation']['nonnegative_determinants'] == 0
    assert coverage['transparent_interior_cells'] == 0
    subprocess.run(['git', 'merge-base', '--is-ancestor', freeze['baseline_input_commit'], 'origin/nightly'], check=True)
    historical_checks = [p.label for p in load_gcps(directory / 'fresh-validation.csv') if p.role == 'check']
    assert historical_checks == (['CB12'] if number == 5 else ['CB13'])
assert (R / 'content-boundary.json').read_bytes() == (OLD / 'content-boundary.json').read_bytes()
for shot in read(R / 'browser-review.json')['screenshots']:
    assert digest(Path(shot['path'])) == shot['sha256']
for review in read(R / 'warped-review/receipt.json')['reviews']:
    assert digest(R / 'warped-review' / review['figure']) == review['figure_sha256']
    assert review['source_pixel_alpha'] > 0
assert len(read(R / 'import-verification.json')['results']) == 8
assert read(R / 'selected-tps6/embedded-import-verification.json')['embeddedMeshNodes'] == 81
assert not read(R / 'status.json')['geographic_acceptance']
assert read(R / 'status.json')['fresh_validation'] == ['CB13']
print(json.dumps({'score_sets_replayed': count, 'new_observation_frames_and_reference_vertices': 3, 'frozen_models': 2, 'actual_raster_windows': 9, 'csv_inventories_verified_in_production_parser': 8, 'geographic_acceptance': False}, indent=2))
