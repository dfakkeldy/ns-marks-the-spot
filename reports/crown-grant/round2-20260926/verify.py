"""Replay the versioned second assessment without changing any fit or record."""
import argparse
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
spec = importlib.util.spec_from_file_location('crown_score', REPO / 'tools/crown-grant/score.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
BASE = '521091b8e1c1bdba07eeed23dbd90775d98fd1ef'
FROZEN = '57765b8d5edc54798491ef524463b98330601633'
METRICS = ['rms_ground_m', 'median_ground_m', 'p95_ground_m', 'max_ground_m',
           'mean_east_ground_m', 'mean_north_ground_m']

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(path):
    return json.loads(path.read_text())

def compare(a, b):
    assert a['count'] == b['count']
    for key in METRICS:
        assert abs(a[key] - b[key]) < 1e-7, (key, a[key], b[key])
    for p, q in zip(a['points'], b['points']):
        assert p['id'] == q['id']
        assert abs(p['error_ground_m'] - q['error_ground_m']) < 1e-7

def verify(private=None):
    summary = read(HERE / 'summary.json')
    baseline = read(REPO / 'reports/crown-grant/series/verification.json')
    assert [r['sheet'] for r in summary['rows']] == baseline['main_rms_fail_sheets']
    assert len(summary['rows']) == 36
    assert summary['accepted_improvements'] == 0 and summary['retained_failures'] == 36
    rows = []
    trial_replays = 0
    private_hashes = 0
    for entry in summary['rows']:
        s = entry['sheet']
        assessment = read(HERE / entry['assessment'])
        origin = REPO / assessment['baseline_report']
        fit_path = origin / assessment['baseline_fit']
        checks_path = origin / assessment['baseline_checks']
        fit = read(fit_path)
        checks = read(checks_path)['points']
        assert digest(fit_path) == assessment['fit_sha256']
        assert digest(checks_path) == assessment['checks_sha256']
        # Target-history bytes, not branch-head provenance.
        for path in [fit_path, checks_path, origin / assessment['baseline_score'],
                     origin / 'components.json', origin / 'status.json']:
            original = subprocess.check_output(['git', 'show', f'{BASE}:{path.relative_to(REPO)}'], cwd=REPO)
            assert path.read_bytes() == original, str(path)
        score = module.score(fit, checks)
        compare(score, assessment['baseline'])
        compare(score, read(origin / assessment['baseline_score']))
        assert score['rms_ground_m'] > 100 and entry['new_active_fit'] is False
        sim = assessment['same_controls_similarity_diagnostic']
        trial = module.score({**fit, 'matrix': sim['matrix']}, checks)
        assert abs(trial['rms_ground_m'] - sim['rms_ground_m']) < 1e-7
        trial_replays += 1
        for trial in assessment['leave_one_control_out']:
            if 'matrix' not in trial:
                continue
            result = module.score({**fit, 'matrix': trial['matrix']}, checks)
            assert abs(result['rms_ground_m'] - trial['diagnostic_rms_m']) < 1e-7
            trial_replays += 1
        if private:
            assets = private / 'private-assets'
            source = assets / f'{s}-000.jpg'
            assert digest(source) == fit['source_sha256']
            assert digest(assets / f'{s}.pdf') == read(origin / 'status.json')['source']['pdf_sha256']
            assert digest(assets / f'{s}-water-tight.geojson') == assessment['reference_sha256']
            private_hashes += 3
            receipt = read(assets / f'sheet{s}/render-receipt.json')
            for component in receipt['components']:
                for kind in ['png', 'tif']:
                    path = assets / f'sheet{s}' / component[kind]
                    assert path.resolve().is_relative_to(private.resolve())
                    assert digest(path) == component[kind + '_sha256']
                    private_hashes += 1
            for artifact in assessment['artifacts']:
                assert digest(private / HERE.name / f'sheet{s}' / artifact['file']) == artifact['sha256']
                private_hashes += 1
        rows.append({'sheet': s, 'baseline_replayed': True, 'baseline_files_unchanged': True,
                     'retained_rms_ground_m': score['rms_ground_m']})
    s5 = HERE / 'sheet005'
    candidate_path = s5 / 'fit-round2-main-similarity-01.json'
    candidate = read(candidate_path)
    original_path = REPO / 'reports/crown-grant/batch1/sheet005/fit-main-affine-01.json'
    assert candidate['points'] == read(original_path)['points']
    matrix = np.asarray(candidate['matrix'])
    singular = np.linalg.svd(matrix[:2], compute_uv=False)
    assert np.linalg.det(matrix[:2]) < 0 and abs(singular[0] - singular[1]) < 1e-10
    cp = s5 / 'checks-round2-fresh-01.json'
    assert [p['id'] for p in read(cp)['points']] == ['R2V01', 'R2V02', 'R2V03']
    for name, fp, check_path in [
        ('scores-round2-fresh-01.json', candidate_path, cp),
        ('scores-baseline-fresh-01.json', original_path, cp),
        ('scores-round2-old-diagnostics-01.json', candidate_path,
         REPO / 'reports/crown-grant/batch1/sheet005/checks-main-affine-01-audited.json')
    ]:
        saved = read(s5 / name)
        assert saved['fit_sha256'] == digest(fp) and saved['checks_sha256'] == digest(check_path)
        compare(module.score(read(fp), read(check_path)['points']), saved)
    assert read(s5 / 'scores-round2-fresh-01.json')['rms_ground_m'] > 100
    assert read(s5 / 'coverage.json')['passed'] and read(s5 / 'source-union-coverage.json')['passed']
    old_parts = read(REPO / 'reports/crown-grant/batch1/sheet005/components.json')
    new_parts = read(s5 / 'components-round2-01.json')
    assert old_parts['source_union_ring_pixel_xy'] == new_parts['source_union_ring_pixel_xy']
    for old, new in zip(old_parts['components'], new_parts['components']):
        assert old['ring_pixel_xy'] == new['ring_pixel_xy']
        assert old.get('holes_pixel_xy') == new.get('holes_pixel_xy')
        assert old.get('matrix') == new.get('matrix')
    if private:
        render = private / HERE.name / 'sheet005/render'
        for component in read(s5 / 'render-receipt.json')['components']:
            for kind in ['png', 'tif']:
                assert digest(render / component[kind]) == component[kind + '_sha256']
                private_hashes += 1
    # Preserve every fit/check/score/components/render receipt that existed at frozen batch1 basis.
    frozen_files = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', FROZEN,
                                            'reports/crown-grant/batch1'], cwd=REPO, text=True).splitlines()
    frozen_count = 0
    for rel in frozen_files:
        name = Path(rel).name
        if name.startswith(('fit-', 'checks-', 'scores-')) or name in ['components.json', 'render-receipt.json']:
            original = subprocess.check_output(['git', 'show', f'{FROZEN}:{rel}'], cwd=REPO)
            assert (REPO / rel).read_bytes() == original, rel
            frozen_count += 1
    return {'sheets': len(rows), 'main_score_replays': len(rows),
            'candidate_comparison_score_replays': 3, 'diagnostic_trial_replays': trial_replays,
            'frozen_batch1_files_unchanged': frozen_count, 'private_hashes_verified': private_hashes,
            'accepted_improvements': 0, 'retained_failures': 36, 'rows': rows}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--private-root', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.private_root), indent=2))
