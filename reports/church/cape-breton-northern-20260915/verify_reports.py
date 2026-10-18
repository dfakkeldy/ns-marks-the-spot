"""Replay this frozen coastal refinement and its independent failures."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

import numpy as np
from shapely.geometry import MultiPoint, Point, shape
from tools.church.gcps import GroundControlPoint, load_gcps
from tools.church.cutlines import Cutline

R = Path(__file__).resolve().parent
OLD = R.parent / 'cape-breton-interior-20260915'
BASE = R.parent / 'cape-breton-continuation-20260915'
CACHE = Path('/Users/dfakkeldy/Downloads/church-cape-breton-northern-20260915')
spec = importlib.util.spec_from_file_location('score', R.parent / 'target-refinement-20260913/score_models.py')
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

six = load_gcps(OLD / 'selected-tps6/controls.csv')
seven = load_gcps(R / 'northern-support-trial/controls.csv')
eight = load_gcps(R / 'selected-tps8/controls.csv')
base = load_gcps(BASE / 'affine3-controls.csv')
checks = [p for p in load_gcps(R / 'island-support-trial/diagnostic-review.csv') if p.role == 'check']
assert [p.label for p in checks] == ['CB04', 'CB13']
assert [p.label for p in eight] == ['CB01', 'CB07', 'CB08', 'CB10', 'CB11', 'CB12', 'CB09', 'CB14']
models = read(R / 'model-comparison.json')['models']
count = 0
for name, cs, method in [('tps6_same_two', six, 'tps'), ('affine7', seven, 'affine'), ('tps7', seven, 'tps'), ('affine8', eight, 'affine'), ('tps8', eight, 'tps')]:
    compare(scorer.score(cs, checks, method), models[name])
    count += 1
freeze = read(R / 'selected-tps8/freeze.json')
subprocess.run(['git', 'merge-base', '--is-ancestor', freeze['baseline_input_commit'], 'origin/nightly'], check=True)
for file in [OLD / 'selected-tps6/controls.csv', OLD / 'CB13-first.json', BASE / 'CB09-first.json']:
    rel = file.relative_to(R.parents[2])
    assert subprocess.check_output(['git', 'show', freeze['baseline_input_commit'] + ':' + str(rel)]) == file.read_bytes()
reference_path = Path('/Users/dfakkeldy/Downloads/church-review-20260913/cape-water-lines.geojson')
reference = {f['properties']['OBJECTID']: f for f in read(reference_path)['features']}
poly = Cutline(tuple(map(tuple, read(R / 'content-boundary.json')['ring_pixel_xy'])))
fresh = []
for name in ['CB14', 'CB15', 'CB16', 'CB17']:
    path = R / 'observations' / (name + '.json')
    p = read(path)
    frame = p['source_frame']
    assert frame['rotation'] == 0
    native = np.asarray(frame['origin']) + np.asarray(p['source_display_pixel_xy']) * np.asarray(frame['extent']) / np.asarray(frame['display'])
    assert np.allclose(native, p['pixel_xy'], rtol=0, atol=1e-9)
    assert poly.contains(*p['pixel_xy'])
    assert digest(Path(p['source_crop_path'])) == p['source_crop_sha256']
    assert digest(reference_path) == p['reference_sha256']
    for v in p.get('reference_vertices', [p.get('reference_vertex')]):
        assert reference[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2] == p['lonlat']
    point = GroundControlPoint(*p['pixel_xy'], *p['lonlat'], 'check', name)
    if name == 'CB14':
        result = read(R / 'CB14-prospective-assessment.json')
        compare(scorer.score(six, [point], 'tps'), result['tps6'])
        original = read(R.parent / 'physical-review-20260913/cape-breton/observations.json')['points'][0]
        assert p['lonlat'] in original['modern_ring']
        assert reference[18462]['properties']['FEAT_CODE'] == 'WACOIS10'
        count += 1
    else:
        result = read(R / (name + '-first.json'))
        assert digest(R / 'selected-tps8/freeze.json') == result['freeze_sha256']
        assert freeze['frozen_at'] < p['recorded_at']
        compare(scorer.score(eight, [point], 'tps'), result['tps8'])
        compare(scorer.score(base, [point], 'affine'), result['baseline_affine3'])
        assert MultiPoint([(q.pixel_x, q.pixel_y) for q in eight]).convex_hull.covers(Point(point.pixel_x, point.pixel_y)) == result['inside_control_hull']
        fresh.append(point)
        count += 2
    assert digest(path) == result['observation_sha256']
summary = read(R / 'fresh-validation-summary.json')
compare(scorer.score(eight, fresh, 'tps'), summary['tps8'])
compare(scorer.score(base, fresh, 'affine'), summary['baseline_affine3'])
count += 2
assert [p.label for p in load_gcps(R / 'selected-tps8/fresh-validation.csv') if p.role == 'check'] == ['CB15', 'CB16', 'CB17']
audit = read(R / 'identity/macadams-network-audit.json')
assert digest(R / 'observations/CB15.json') == audit['original_observation_sha256']
for key in ['Bonds_to_Gaspereaux', 'Gaspereaux_to_Salmon']:
    for fid, vertex in audit[key]['shared_vertices']:
        assert reference[fid]['geometry']['coordinates'][vertex][:2] == audit[key]['lonlat']
assert shape(read(R / 'identity/macadams-identity-polygon.geojson')['geometry']).contains(Point(-60.35521, 45.913887))
receipt = read(R / 'selected-tps8/artifact-receipt.json')
assert digest(R / 'selected-tps8/controls.csv') == freeze['controls_csv_sha256'] == receipt['controls_sha256']
assert digest(R / 'selected-tps8/freeze.json') == receipt['freeze_sha256']
assert (R / 'content-boundary.json').read_bytes() == (OLD / 'content-boundary.json').read_bytes()
assert digest(R / 'content-boundary.json') == freeze['boundary_sha256'] == receipt['boundary_sha256']
coverage = read(R / 'selected-tps8/coverage.json')
assert digest(CACHE / 'rendered/cape-breton-tps8-review-20m.tif') == receipt['output_sha256'] == coverage['raster_sha256']
assert coverage['transparent_interior_cells'] == 0
assert receipt['orientation']['nonnegative_determinants'] == 0
for view in read(R / 'warped-review/receipt.json')['reviews']:
    assert digest(R / 'warped-review' / view['figure']) == view['figure_sha256']
    assert view['source_pixel_alpha'] > 0
for shot in read(R / 'browser-review.json')['screenshots']:
    assert digest(Path(shot['path'])) == shot['sha256']
assert len(read(R / 'import-verification.json')['results']) == 6
assert read(R / 'selected-tps8/embedded-import-verification.json')['embeddedMeshNodes'] == 81
assert not read(R / 'status.json')['geographic_acceptance']
print(json.dumps({'score_sets_replayed': count, 'native_observation_audits': 4, 'fresh_checks': 3, 'actual_raster_windows': 13, 'editable_inventories': 6, 'geographic_acceptance': False}, indent=2))
