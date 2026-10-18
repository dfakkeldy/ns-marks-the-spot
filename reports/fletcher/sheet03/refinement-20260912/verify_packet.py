"""Verify this recovered evidence packet; passing is not geographic acceptance."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

D = Path(__file__).resolve().parent
R = D.parents[3]
P = D.parent
DATA = Path.home() / 'Downloads/fletcher-sheet03'

def read(p):
    return json.loads(p.read_text())

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def check_files(rows, root):
    for row in rows:
        assert sha(root / row['path']) == row['sha256'], row['path']

recovered = read(D / 'recovered-packet.json')
check_files(recovered['files'], D)
baseline = read(D / 'baseline.json')
subprocess.run(['git', 'merge-base', '--is-ancestor', baseline['base_commit'], 'origin/nightly'], cwd=R, check=True)
for row in baseline['files']:
    contents = subprocess.check_output(['git', 'show', baseline['base_commit'] + ':' + row['path']], cwd=R)
    assert hashlib.sha256(contents).hexdigest() == row['sha256']
    assert sha(R / row['path']) == row['sha256']
check_files(read(D / 'baseline-verification.json')['files'], R)
for name, key in [('join-provenance-audit.json', 'rasters'), ('render-input-audit.json', 'files')]:
    check_files(read(D / name)[key], R)
for ref in read(P / 'reference-receipts.json'):
    path = DATA / 'reference-full' / (ref['name'] + '.geojson')
    assert sha(path) == ref['sha256']
    assert len(read(path)['features']) == ref['count']
source = read(P / 'source-receipt.json')
assert sha(Path(source['source_path'])) == source['source_sha256']
for row in source['regions']:
    assert sha(Path(row['path'])) == row['sha256']

base = read(P / 'final-fit.json')['points']
nine = read(D / 'fit-nine.json')['points']
ten = read(D / 'fit-ten.json')['points']
assert nine[:7] == base and ten[:9] == nine
u01 = read(D / 'validation.json')['points'][0]
r14 = ten[-1]
for key in ['pixel_xy', 'lonlat']:
    assert r14[key] == u01[key]
assert r14['prior_error_ground_m'] == read(D / 'validation-scores.json')['points'][0]['error_ground_m']

history_files = sorted(p for p in P.glob('*.json') if any(w in p.name for w in ['fit', 'check', 'validation', 'reject', 'candidate']))
history = [point for p in history_files for point in (read(p).get('points', []) if isinstance(read(p), dict) else []) if 'pixel_xy' in point and 'lonlat' in point]
dedup = []
for stage, count, checkname, receiptname in [('nine', 9, 'validation.json', 'raster-nine-receipt.json'), ('ten', 10, 'validation-ten.json', 'raster-receipt.json')]:
    fitpath = D / ('fit-' + stage + '.json')
    fit = read(fitpath)
    freeze = read(D / ('freeze-' + stage + '.json'))
    checks = read(D / checkname)
    scorepath = D / ('validation-scores.json' if stage == 'nine' else 'validation-ten-scores.json')
    scores = read(scorepath)
    assert len(fit['points']) == count
    assert freeze['fit_sha256'] == checks['fit_sha256'] == scores['fit_sha256'] == sha(fitpath)
    assert datetime.datetime.fromisoformat(freeze['frozen_at_utc']) < datetime.datetime.fromisoformat(checks['selected_at_utc'])
    assert scores['checks_sha256'] == sha(D / checkname)
    assert {p['id'] for p in checks['points']} == {p['id'] for p in scores['points']}
    previous = history + fit['points']
    if stage == 'ten':
        previous += read(D / 'validation.json')['points'] + read(D / 'rejected-controls.json')['points']
    for point in checks['points']:
        duplicates = [p['id'] for p in previous if p['lonlat'] == point['lonlat'] or p['pixel_xy'] == point['pixel_xy']]
        assert not duplicates, (point['id'], duplicates)
        dedup.append({'stage': stage, 'id': point['id'], 'exact_coordinate_duplicate': False, 'limitation': 'Distinct coordinate only; shared island/lake-group/watershed identity and U06 uncertainty remain explicit.'})
    receipt = read(D / receiptname)
    raster = receipt['raster']
    assert sha(Path(raster['path'])) == raster['sha256']
    assert receipt['fit_sha256'] == sha(fitpath)
    assert receipt['boundary_sha256'] == sha(P / 'boundary.json')
    assert receipt['orientation']['samples'] == 73201
    assert receipt['orientation']['nonnegative_determinants'] == 0
    coverage = read(D / ('coverage-' + stage + '-audit.json'))
    assert coverage['passed'] and coverage['transparent_interior_cells'] == 0
    assert coverage['raster_sha256'] == raster['sha256']
    assert coverage['cutline_sha256'] == sha(Path(raster['path']).parent / 'neatline.geojson')
    browser = read(D / ('browser-' + stage) / 'verification.json')
    mobile = read(D / ('browser-' + stage) / 'mobile-verification.json')
    assert browser['enabledStateSurvived']
    assert browser['before'] == browser['after']
    for snapshot in [browser['before'], browser['after'], mobile]:
        assert snapshot['storedRasterSha256'] == raster['sha256']
        assert list(snapshot['record']['pixelSize'].values()) == raster['size']
        assert snapshot['transparentPixels'] > 0 and snapshot['opaquePixels'] > 0
    assert read(D / ('browser-' + stage) / 'errors.json') == []

features = {f['properties']['OBJECTID']: f for f in read(DATA / 'reference-full/water-lines.geojson')['features']}
for filename in ['reviewed-additions.json', 'validation.json', 'validation-ten.json']:
    for p in read(D / filename)['points']:
        if 'modern_objectid' in p:
            g = features[p['modern_objectid']]['geometry']
            parts = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
            xy = parts[p['modern_part']][p['modern_vertex']]
            assert max(abs(a-b) for a,b in zip(xy,p['lonlat'])) < 1e-10
        else:
            for oid in p['objectids']:
                g = features[oid]['geometry']
                parts = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
                assert any(max(abs(a-b) for a,b in zip(xy,p['lonlat'])) < 1e-7 for part in parts for xy in [part[0],part[-1]])
visual = read(D / 'visual-review-audit.json')
assert visual['count'] == len(visual['figures']) == 71
check_files(visual['figures'], D)
assert {str(p.relative_to(D)) for p in D.rglob('*') if p.suffix in ['.png', '.jpg']} == {r['path'] for r in visual['figures']}
imports = read(D / 'import-verification.json')
assert imports['passed']
for exp in imports['experiments']:
    assert exp['semantic_roundtrip'] and exp['maximum_web_gdal_difference_projected_m'] < 1e-7
acceptance = read(D / 'acceptance.json')
assert not acceptance['whole_sheet_geographically_accepted'] and not acceptance['production_eligible']
assert not read(D / 'post-score-identity-audit.json')['U06']['eligible_for_secure_validation']
result = {'passed': True, 'recovered_files_unchanged': len(recovered['files']), 'viewed_figures': 71, 'source_native_regions_hash_verified': len(source['regions']), 'baseline_on_nightly_history': True, 'historical_check_coordinate_dedup': dedup, 'full_boundary_coverage': True, 'browser_desktop_mobile_reload': True, 'whole_sheet_geographically_accepted': False, 'scope': 'Technical evidence integrity and arithmetic, not independent first-score chronology or geographic acceptance.'}
(D / 'packet-verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
