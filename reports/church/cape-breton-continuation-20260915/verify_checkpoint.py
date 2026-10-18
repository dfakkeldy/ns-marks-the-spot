"""Replay this frozen checkpoint; no source observations are regenerated."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

import numpy as np
from tools.church.gcps import GroundControlPoint, load_gcps

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('church_score', ROOT.parent / 'target-refinement-20260913/score_models.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def read(name):
    return json.loads((ROOT / name).read_text())

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def compare(actual, expected):
    if isinstance(expected, dict):
        for key, value in expected.items():
            compare(actual[key], value)
    elif isinstance(expected, list):
        assert len(actual) == len(expected)
        for a, b in zip(actual, expected, strict=True):
            compare(a, b)
    elif isinstance(expected, (int, float)):
        assert abs(actual - expected) < 1e-5, (actual, expected)
    else:
        assert actual == expected, (actual, expected)

freeze = read('affine3-freeze.json')
assert digest(ROOT / 'affine3-controls.csv') == freeze['control_csv_sha256']
assert digest(ROOT / 'content-boundary.json') == freeze['boundary_sha256']
original = subprocess.check_output(['git', 'show', freeze['frozen_input_commit'] + ':reports/church/distributed-review-20260913/cape-breton/frozen-controls.csv'])
assert original == (ROOT / 'affine3-controls.csv').read_bytes()
subprocess.run(['git', 'merge-base', '--is-ancestor', freeze['frozen_input_commit'], 'origin/nightly'], check=True)
base = load_gcps(ROOT / 'affine3-controls.csv')
trial = load_gcps(ROOT / 'southern-support-trial/controls.csv')
checks = [p for p in load_gcps(ROOT / 'southern-support-trial/diagnostic-review.csv') if p.role == 'check']
assert [p.label for p in checks] == ['CB04', 'CB09']
expected = read('southern-support-trial/model-comparison.json')['models']
for key, controls, method in [('affine3_same_two', base, 'affine'), ('affine4', trial, 'affine'), ('tps4', trial, 'tps')]:
    compare(module.score(controls, checks, method), expected[key])
assert read('accuracy-summary.json') == read('southern-support-trial/model-comparison.json')
reference = None
for name in ['CB09', 'CB10']:
    p = read('observations/' + name + '.json')
    frame = p['source_frame']
    assert frame['rotation'] == 0
    xy = np.asarray(frame['origin']) + np.asarray(p['source_display_pixel_xy']) * np.asarray(frame['extent']) / np.asarray(frame['display'])
    assert np.allclose(xy, p['pixel_xy'], atol=1e-9, rtol=0)
    assert digest(Path(p['source_crop_path'])) == p['source_crop_sha256']
    assert digest(Path(p['reference_path'])) == p['reference_sha256']
    if reference is None:
        reference = {f['properties']['OBJECTID']: f for f in json.loads(Path(p['reference_path']).read_text())['features']}
    v = p['reference_vertex']
    feature = reference[v['feature_id']]
    assert feature['properties']['FEAT_CODE'] == 'WACO20'
    assert feature['geometry']['coordinates'][v['vertex']][:2] == p['lonlat']
    point = GroundControlPoint(*p['pixel_xy'], *p['lonlat'], 'check', name)
    score = module.score(base, [point], 'affine')
    result = read('CB09-first.json') if name == 'CB09' else read('southern-support-trial/prospective-control-assessment.json')
    compare(score, result['affine3'])
    if name == 'CB09':
        assert digest(ROOT / 'observations/CB09.json') == result['observation_sha256']
        assert digest(ROOT / 'affine3-freeze.json') == result['freeze_sha256']
receipt = read('baseline-artifact-receipt.json')
coverage = read('baseline-coverage.json')
assert digest(Path(coverage['raster'])) == receipt['output_sha256'] == coverage['raster_sha256']
assert coverage['transparent_interior_cells'] == 0
browser = read('browser-review.json')
assert browser['artifact_sha256'] == receipt['output_sha256']
for shot in browser['screenshots']:
    assert digest(Path(shot['path'])) == shot['sha256']
assert not read('status.json')['geographic_acceptance']
print(json.dumps({'score_sets_replayed': 5, 'new_observation_frames_and_reference_vertices': 2, 'frozen_controls_byte_identical': True, 'raster_and_screenshot_hashes_verified': True, 'geographic_acceptance': False}, indent=2))
