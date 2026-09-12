"""Verify packet integrity and technical evidence, not geographic acceptance."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess

D = Path(__file__).resolve().parent
P = D.parent
R = D.parents[3]
DATA = Path.home() / 'Downloads/fletcher-sheet01'
def j(p):
    return json.loads(p.read_text())
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
RECORDED_ROOT = Path('/Users/dfakkeldy/.codex/worktrees/8d5b/ns-marks-the-spot')

def resolve_recorded_path(value, root=R):
    path = Path(value)
    if path.is_absolute():
        try:
            relative = path.relative_to(RECORDED_ROOT)
        except ValueError:
            return path  # External source, reference and raster locations stay exact.
        return R / relative
    return root / path

def verify(rows, root=R):
    for row in rows:
        assert sha(resolve_recorded_path(row['path'], root)) == row['sha256'], row['path']

base = j(D / 'baseline-verification.json')
subprocess.run(['git','merge-base','--is-ancestor',base['base_commit'],'origin/nightly'],cwd=R,check=True)
verify(base['files'])
provenance = j(D / 'render-provenance.json')
verify(provenance['files'])
verify(provenance['rasters'])
for row in provenance['files']:
    path = resolve_recorded_path(row['path'])
    if path.parent == P:
        original = subprocess.check_output(['git','show',base['base_commit']+':'+str(path.relative_to(R))],cwd=R)
        assert hashlib.sha256(original).hexdigest() == row['sha256']
for ref in j(P / 'reference-receipts.json'):
    p = DATA / 'reference-full' / (ref['name']+'.geojson')
    assert sha(p) == ref['sha256'] and len(j(p)['features']) == ref['count']
fit = j(D / 'reviewed-fit.json')
old = j(P / 'final-fit.json')
assert fit['points'][:8] == old['points'] and len(fit['points']) == 10
assert fit['prior_control_count'] == 8
assert fit['source_width'] == 10874 and fit['source_height'] == 7680
freeze = j(D / 'frozen-fit.json')
checks = j(D / 'validation.json')
assert freeze['fit_sha256'] == checks['fit_sha256'] == sha(D / 'reviewed-fit.json')
assert datetime.datetime.fromisoformat(freeze['frozen_at']) < datetime.datetime.fromisoformat(checks['selected_at'])
assert datetime.datetime.fromisoformat(checks['selected_at']) < datetime.datetime.fromisoformat(checks['reviewed_at'])
assert freeze['prior_fit_sha256'] == sha(P / 'final-fit.json')
assert {p['id'] for p in checks['points']} == {'F01'}
for p in checks['points']:
    assert p['lonlat'] not in [p['lonlat'] for p in fit['points']]
    assert p['pixel_xy'] not in [p['pixel_xy'] for p in fit['points']]
    for prior in [P/'validation.json', P/'rejected-diagnostics.json', P/'rejected-validation.json', P/'rejected-candidates.json']:
        for q in j(prior)['points']:
            assert p['pixel_xy'] != q['pixel_xy'] and p['lonlat'] != q['lonlat']
assert {p['id'] for p in j(D/'rejected-fresh.json')['points']} == {'F02'}
for score_name, check_name, fit_path in [('validation-scores.json','validation.json',D/'reviewed-fit.json'),('baseline-scores.json','baseline-checks.json',P/'final-fit.json'),('raster-receipt.json','diagnostic-checks.json',D/'reviewed-fit.json')]:
    score = j(D/score_name)
    assert score['fit_sha256'] == sha(fit_path)
    assert score['checks_sha256'] == sha(D/check_name)
    assert {p['id'] for p in score['points']} == {p['id'] for p in j(D/check_name)['points']}
features = {f['properties']['OBJECTID']:f for f in j(DATA/'reference-full/water-lines.geojson')['features']}
for name in ['reviewed-additions.json','fresh-candidates.json','validation.json']:
    for point in j(D/name)['points']:
        if 'modern_objectid' in point:
            g = features[point['modern_objectid']]['geometry']
            parts = [g['coordinates']] if g['type']=='LineString' else g['coordinates']
            xy = parts[point['modern_part']][point['modern_vertex']]
            assert max(abs(a-b) for a,b in zip(xy,point['lonlat'])) < 1e-10
        else:
            for oid in point['objectids']:
                g = features[oid]['geometry']
                parts = [g['coordinates']] if g['type']=='LineString' else g['coordinates']
                assert any(max(abs(a-b) for a,b in zip(xy,point['lonlat'])) < 1e-7 for part in parts for xy in [part[0],part[-1]])
frame_count = 0
for framefile in D.glob('*/frames.json'):
    for frame in j(framefile):
        if 'point_record' not in frame:
            continue
        point = next(p for p in j(R/'reports/fletcher'/frame['point_record'])['points'] if p['id']==frame['point_id'])
        assert frame['native_coordinates'] == point['pixel_xy']
        assert frame['modern_lonlat'] == point['lonlat'] and frame['rotation_degrees'] == 0
        x0,y0,x1,y1 = frame['native_box']
        assert [x0+(x1-x0)/2,y0+(y1-y0)/2] == point['pixel_xy']
        frame_count += 1
assert frame_count == 10
receipt = j(D/'raster-receipt.json');raster=receipt['raster']
assert sha(Path(raster['path'])) == raster['sha256']
assert receipt['orientation']['samples'] == 71625 and receipt['orientation']['nonnegative_determinants'] == 0
coverage=j(D/'coverage.json')
assert coverage['passed'] and coverage['transparent_interior_cells'] == 0
assert coverage['raster_sha256'] == raster['sha256']
assert coverage['cutline_sha256'] == sha(DATA/'refinement-20260912/neatline.geojson')
imports=j(D/'import-verification.json')
assert (imports['controls'],imports['checks'],imports['validation_checks']) == (10,1,1)
assert imports['semantic_csv_roundtrip'] and imports['maximum_web_gdal_difference_projected_m'] < 1e-7
browser=j(D/'browser/verification.json');mobile=j(D/'browser/mobile-verification.json')
assert browser['enabledStateSurvived'] and browser['before'] == browser['after']
for snapshot in [browser['before'],browser['after'],mobile]:
    assert snapshot['storedRasterSha256'] == raster['sha256']
    assert [snapshot['record']['pixelSize']['width'],snapshot['record']['pixelSize']['height']] == raster['size']
    assert snapshot['transparentPixels'] > 0 and snapshot['opaquePixels'] > 0
assert j(D/'browser/errors.json') == []
visual=j(D/'visual-review.json');verify(visual['figures'],D)
assert visual['count'] == len(visual['figures']) == 24
assert {str(p.relative_to(D)) for p in D.rglob('*') if p.suffix in ['.jpg','.png']} == {r['path'] for r in visual['figures']}
assert not j(D/'acceptance.json')['whole_sheet_geographically_accepted']
result={'passed':True,'unchanged_prior_controls':8,'verified_native_frames':10,'viewed_figures':24,'coverage_and_sampled_orientation':'pass','web_csv_and_solver':'pass','actual_browser_import_desktop_mobile_reload':'pass','fresh_check_scope':'One new coastal mouth near repair C11; no independent inland validation. Diagnostic and validation CSVs deliberately replay the same single check.','whole_sheet_geographically_accepted':False}
(D/'packet-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
