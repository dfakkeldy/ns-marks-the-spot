"""Replay this report without altering observations or first results.

PYTHONPATH=. /opt/local/bin/python3.12 reports/church/distributed-review-20260913/verify_reports.py
Requires GDAL, NumPy, Shapely and the preserved Git baseline. The saved reference
subsets suffice for observation checks; large source scans are not required.
"""
import json
import math
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np
from shapely.geometry import MultiPoint, Point, Polygon

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OLD = HERE.parent / 'physical-review-20260913'
BASELINE = 'd2cb82040e10f68d50e805702f71d33f7e2148db'
sys.path.insert(0, str(HERE.parent / 'physical-review-20260912/richmond/refinement-03'))
from freeze_western_repair import digest, load_gcps, score
from tools.church.landmarks import polygon_centroid
from tools.church.panels import get_panel
from tools.church.residuals import solve_affine


def read(path):
    return json.loads(path.read_text())


def controls(path):
    return [p for p in load_gcps(path) if p.role == 'control']


def checks(path):
    return [p for p in load_gcps(path) if p.role == 'check']


def verify_observation(panel, p):
    frame = p['source_frame']
    assert frame['rotation'] == 0
    if 'source_outline_display_pixels' in p:
        outline = p['source_outline_display_pixels']
        assert Polygon(outline).is_valid, p['id']
        display_xy = polygon_centroid(outline)[:2]
    else:
        display_xy = p['source_display_pixel_xy']
    xy = [frame['origin'][i] + display_xy[i] * frame['extent'][i] / frame['display'][i]
          for i in range(2)]
    assert np.allclose(xy, p['pixel_xy'], atol=1e-7, rtol=0), p['id']
    assert all(0 <= display_xy[i] <= frame['display'][i] for i in range(2))
    if 'modern_ring' in p:
        assert Polygon(p['modern_ring']).is_valid
        assert np.allclose(polygon_centroid(p['modern_ring'])[:2], p['lonlat'], atol=1e-10, rtol=0)
    path = HERE / panel / (p['id'] + '-reference-features.geojson')
    if path.exists():
        fs = {f['id']: f for f in read(path)['features']}
        assert set(p.get('reference_feature_ids', [])) <= fs.keys(), p['id']
        if 'reference_vertex' in p:
            v = p['reference_vertex']
            ll = fs[v['feature_id']]['geometry']['coordinates'][v['vertex']][:2]
            assert np.allclose(ll, p['lonlat'], atol=1e-12, rtol=0), p['id']
    return dict(id=p['id'], panel=panel, source_frame_roundtrip=True,
                phase=p.get('validation_phase'), role=p['role'])


def same_metrics(actual, expected):
    assert actual['count'] == expected['count']
    for key, value in actual.items():
        if isinstance(value, (int, float)):
            assert math.isclose(value, expected[key], abs_tol=.001, rel_tol=0), (key, value, expected[key])
    for a, e in zip(actual['points'], expected['points'], strict=True):
        assert a['label'] == e['label']
        for key in ['east_ground_m', 'north_ground_m', 'error_ground_m']:
            assert abs(a[key] - e[key]) < .001, (key, a, e)


def main():
    preserved = ['reports/church/physical-review-20260912',
                 'reports/church/physical-review-20260913',
                 'tools/church/gcps/inverness-south.csv',
                 'tools/church/checks/inverness-south.csv',
                 'tools/church/gcps/victoria-main.csv', 'tools/church/panels.py']
    subprocess.run(['git', 'diff', '--exit-code', BASELINE, '--', *preserved],
                   cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    panels = ['richmond', 'inverness-north', 'victoria-northwest', 'victoria-main', 'cape-breton']
    observations = []
    for panel in panels:
        for p in read(HERE / panel / 'observations.json')['points']:
            observations.append(verify_observation(panel, p))
    cow = read(HERE / 'inverness-south/diagnostic-observations.json')['points'][0]
    observations.append(verify_observation('inverness-south', cow))
    corrected = read(HERE / 'inverness-north/I10-correction.json')
    observations.append(verify_observation('inverness-north', corrected))

    # Frozen controls stay identical, except the disclosed I10 source correction
    # and the two newly observed Cape Breton mainland controls.
    old_fits = {
        'richmond': HERE.parent / 'physical-review-20260912/richmond/refinement-04/frozen-fit.csv',
        'victoria-northwest': OLD / 'victoria-northwest/four-control-trial.csv',
        'victoria-main': OLD / 'victoria-main/physical-trial.csv',
    }
    for panel, old in old_fits.items():
        assert controls(HERE / panel / 'fresh-validation-review.csv') == controls(old)
    north_cs = controls(HERE / 'inverness-north/corrected-I10-frozen.csv')
    expected_north = [replace(p, pixel_x=7948, pixel_y=25473) if p.label == 'I10' else p
                      for p in controls(OLD / 'inverness-north/physical-trial.csv')]
    assert north_cs == expected_north
    assert controls(HERE / 'inverness-north/fresh-validation-review.csv') == north_cs
    assert controls(HERE / 'inverness-north/diagnostic-review.csv') == north_cs
    assert digest(HERE / 'inverness-north/corrected-I10-frozen.csv') == corrected['frozen_csv_sha256']
    assert digest(OLD / 'inverness-north/physical-trial.csv') == corrected['prior_trial_sha256']
    cape_cs = controls(HERE / 'cape-breton/physical-trial.csv')
    assert cape_cs[:1] == controls(OLD / 'cape-breton/island-observations.csv')
    assert [p.label for p in cape_cs] == ['CB01', 'CB07', 'CB08']
    assert checks(HERE / 'cape-breton/physical-trial.csv') == checks(OLD / 'cape-breton/island-observations.csv')
    assert cape_cs == controls(HERE / 'cape-breton/frozen-controls.csv')
    south_cs = controls(OLD / 'inverness-south/physical-trial.csv')
    assert controls(HERE / 'inverness-south/audited-diagnostic-review.csv') == south_cs

    cases = []
    coverage = {}
    for panel in panels:
        filename = 'physical-trial.csv' if panel == 'cape-breton' else 'fresh-validation-review.csv'
        path = HERE / panel / filename
        cs, ks = controls(path), checks(path)
        csv_points = {p.label: p for p in cs + ks}
        for observation in read(HERE / panel / 'observations.json')['points']:
            point = csv_points[observation['id']]
            assert point.role == observation['role']
            assert [point.pixel_x, point.pixel_y] == observation['pixel_xy']
            assert [point.lon, point.lat] == observation['lonlat']
        result = read(HERE / panel / 'first-scores.json')
        assert digest(path) == result['csv_sha256']
        cases.append((panel, cs, ks, result['method'], result['metrics']))
        county, slug = {'richmond': ('richmond', 'main'), 'inverness-north': ('inverness', 'north'),
                        'victoria-northwest': ('victoria', 'northwest'), 'victoria-main': ('victoria', 'main'),
                        'cape-breton': ('cape-breton', 'main')}[panel]
        hull = MultiPoint([(p.pixel_x, p.pixel_y) for p in cs]).convex_hull
        membership = {p.label: hull.covers(Point(p.pixel_x, p.pixel_y)) for p in ks}
        assert membership == result['source_hull']
        boundary = 'tools/church/panels.py'
        if panel == 'richmond':
            # The selected review raster has an audited expanded content cutline,
            # distinct from the still-disabled production catalog panel.
            boundary = 'reports/church/physical-review-20260912/richmond/content-boundary.json'
            content = Polygon(read(ROOT / boundary)['ring_pixel_xy'])
        else:
            content = Polygon(get_panel(county, slug).cutline.vertices)
        assert all(content.covers(Point(p.pixel_x, p.pixel_y)) for p in cs + ks), panel
        determinant = None
        if result['method'] == 'affine':
            model = solve_affine(cs)
            determinant = model.a * model.e - model.b * model.d
            assert determinant < 0  # native y is down; map northing is up
        coverage[panel] = dict(control_count=len(cs), scored_check_count=len(ks), source_hull=membership,
                               content_boundary=boundary,
                               content_fraction_inside_control_hull=hull.intersection(content).area / content.area,
                               affine_orientation_determinant=determinant,
                               limitation='Hull overlap is a geometric support diagnostic, not accuracy or validated coverage. Affine cannot fold; Richmond TPS retains its prior sampled review only.')

    n = HERE / 'inverness-north'
    comp = read(n / 'correction-comparison.json')
    nchecks = checks(n / 'diagnostic-review.csv')
    cases += [('north retained N03 prior', controls(OLD / 'inverness-north/physical-trial.csv'), nchecks, 'affine', comp['models']['prior-affine']),
              ('north retained N03 corrected', north_cs, nchecks, 'affine', comp['models']['corrected-affine'])]
    s = HERE / 'inverness-south'
    comp = read(s / 'audit-comparison.json')
    assert digest(s / 'audited-diagnostic-review.csv') == comp['audited_csv_sha256']
    sks = checks(s / 'audited-diagnostic-review.csv')
    assert len(sks) == 6
    assert 'island-45-801n-61-038w' not in [p.label for p in sks]
    prior_checks = checks(OLD / 'inverness-south/physical-trial.csv')
    expected = [replace(p, pixel_x=cow['pixel_xy'][0], pixel_y=cow['pixel_xy'][1]) if p.label == cow['label'] else p
                for p in prior_checks if p.label != 'island-45-801n-61-038w']
    assert sks == expected
    hull = MultiPoint([(p.pixel_x, p.pixel_y) for p in south_cs]).convex_hull
    content = Polygon(get_panel('inverness', 'south').cutline.vertices)
    model = solve_affine(south_cs)
    coverage['inverness-south'] = dict(control_count=4, scored_check_count=6, fresh_check_count=0,
        source_hull={p.label: hull.covers(Point(p.pixel_x, p.pixel_y)) for p in sks},
        content_boundary='tools/church/panels.py',
        content_fraction_inside_control_hull=hull.intersection(content).area / content.area,
        affine_orientation_determinant=model.a * model.e - model.b * model.d,
        limitation='Separate audited historical diagnostics, five still approximate hand points. Control-hull overlap is not geographic validation.')
    cases += [('south baseline audited six', controls(ROOT / 'tools/church/gcps/inverness-south.csv'), sks, 'tps', comp['models']['accepted-baseline-on-audited-six']),
              ('south physical audited six', south_cs, sks, 'affine', comp['models']['physical-affine-on-audited-six']),
              ('Cow Island original hand', south_cs, [p for p in prior_checks if p.label == cow['label']], 'affine', comp['cow_only']['original-hand-on-affine']),
              ('Cow Island retrace', south_cs, [p for p in sks if p.label == cow['label']], 'affine', comp['cow_only']['retrace-on-affine'])]
    replayed = []
    for name, cs, ks, method, expected in cases:
        assert not {p.label for p in cs} & {p.label for p in ks}, name
        assert not {(p.lon, p.lat) for p in cs} & {(p.lon, p.lat) for p in ks}, name
        actual = score(cs, ks, method)
        same_metrics(actual, expected)
        replayed.append(dict(name=name, controls=len(cs), checks=len(ks), method=method,
                             rms_ground_m=actual['rms_ground_m'], replayed=True))
    result = dict(baseline_commit=BASELINE, preserved_paths=preserved, historical_inputs_unchanged=True,
                  observation_checks=observations, replays=replayed,
                  scope='Numerical/frame/reference integrity only. Visual correspondence review and geographic acceptance are separate.',
                  geographic_acceptance=False)
    (HERE / 'verification-summary.json').write_text(json.dumps(result, indent=2) + '\n')
    (HERE / 'coverage-summary.json').write_text(json.dumps(coverage, indent=2) + '\n')
    print(f'{len(replayed)} metric sets replayed; {len(observations)} source-frame observations verified; historical files unchanged.')


if __name__ == '__main__':
    main()
