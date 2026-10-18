"""Audit archived candidates, source provenance and reviewed inventory. Run without -O."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--crops', type=Path, help='Directory containing exact source PNGs')
args = parser.parse_args()
base = Path(__file__).resolve().parent
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
ledger = load(base / 'crops.json')
runs = load(base / 'runs.json')
adj = load(base / 'adjudication.json')
data = load(base.parent / 'judique-southeast.json')
crops = {c['id']: c for c in ledger['crops']}


def valid(box):
    assert len(box) == 4 and all(type(n) is int for n in box), box
    assert min(box[:2]) >= 0 and min(box[2:]) > 0, box


def inside(box, extent):
    x, y, w, h = box
    a, b, c, d = extent
    return a <= x and b <= y and x + w <= a + c and y + h <= b + d


def union_area(rects):
    xs = sorted({v for x, y, w, h in rects for v in (x, x + w)})
    total = 0
    for left, right in zip(xs, xs[1:]):
        end = -1
        covered = 0
        for low, high in sorted((y, y + h) for x, y, w, h in rects if x <= left and right <= x + w):
            covered += max(0, high - max(low, end))
            end = max(end, high)
        total += (right - left) * covered
    return total


sheet = [0, 0, *data['source']['source_dimensions_px']]
core = data['source']['core_review_region_xywh']
assert core == [5600, 3500, 3100, 2350]
assert list(crops) == [f'I0{i}' for i in range(1, 7)]
assert data['coverage']['review_windows_xywh'] == [c['source_region_xywh'] for c in crops.values()]
assert union_area(data['coverage']['review_windows_xywh']) == core[2] * core[3]
assert data['coverage']['edge_context_windows_xywh'] == [c['source_region_xywh'] for c in ledger['edge_context']]
for c in list(crops.values()) + ledger['edge_context']:
    valid(c['source_region_xywh'])
    assert inside(c['source_region_xywh'], sheet)
    if c['id'] in crops:
        assert c['state'] == 'reviewed' and inside(c['source_region_xywh'], core)
    if args.crops:
        assert sha(args.crops / c['image_filename']) == c['image_sha256'], c['id']
receipt = load(base.parent / data['source']['native_mosaic_receipt'])
assert receipt['mosaic_sha256'] == ledger['source_mosaic_sha256'] == data['source']['native_mosaic_sha256']
assert receipt['dimensions_px'] == data['source']['source_dimensions_px']
assert not runs['automatic_import_allowed'] and not adj['automatic_import_allowed']
candidates = {}
structural_defects = []
seen_crops = []
for run in runs['runs']:
    name = run['worker']
    assert sha(base / run['raw_output']) == run['sha256']
    assert sha(base / (name + '-prompt.txt')) == run['prompt_sha256']
    assert sha(base / (name + '-config.json')) == run['runtime_config_sha256']
    assert sha(base / (name + '-crop.py')) == run['crop_helper_sha256']
    assert run['models_recorded'] == [{'provider': 'deepseek-cc-switch', 'model': 'deepseek-v4-flash-vision-exp'}]
    assert run['billed_cost'] is None
    raw = load(base / run['raw_output'])
    assert raw['model_requested'] == run['model_requested'] == runs['model_requested']
    assert [c['crop_id'] for c in raw['crops']] == run['reported_crop_ids']
    assert [run['crop_id_aliases'][cid] for cid in run['reported_crop_ids']] == run['crop_ids']
    for c in raw['crops']:
        cid = run['crop_id_aliases'][c['crop_id']]
        seen_crops.append(cid)
        assert [c['width'], c['height']] == crops[cid]['source_region_xywh'][2:]
        for a in c['annotations']:
            key = name + ':' + a['local_id']
            assert key not in candidates
            assert a['source_text'] and a['label_boxes_xywh']
            assert a['reading_status'] in ('clear', 'tentative', 'partial')
            candidates[key] = cid
            for i, box in enumerate(a['label_boxes_xywh']):
                valid(box)
                if not inside(box, [0, 0, c['width'], c['height']]):
                    structural_defects.append({'candidate_id': key, 'box_index': i, 'box_xywh': box, 'defect': 'outside declared native crop bounds'})
        for region in c['unresolved_regions']:
            valid(region['box_xywh'])
            assert inside(region['box_xywh'], [0, 0, c['width'], c['height']])
assert sorted(seen_crops) == sorted(crops)
assert len(candidates) == adj['candidate_records'] == 69
assert structural_defects == adj['raw_structural_defects']
previous = [load(base.parent / (name + '.json')) for name in ['judique-pilot', 'judique-inland', 'judique-south']]
old = {f['id']: f for d in previous for f in d['features']}
features = {f['id']: f for f in data['features']}
assert len(old) == 93
assert len(features) == len(data['features']) == adj['reviewed_annotations']
assert list(features) == [f'F19-JUD-{i:03}' for i in range(94, 94 + len(features))]
assert not set(old).intersection(features)
assert Counter(row['candidate_id'] for row in adj['candidate_dispositions']) == Counter(candidates.keys())
referenced = set()
for row in adj['candidate_dispositions']:
    assert row['source_crop_id'] == candidates[row['candidate_id']]
    assert row['disposition'] in ('retained', 'existing-annotation', 'excluded', 'deferred')
    ids = row['annotation_ids']
    if row['disposition'] == 'retained':
        assert ids and set(ids) <= set(features)
    elif row['disposition'] == 'existing-annotation':
        assert ids and set(ids) <= set(old)
    else:
        assert not ids and row['note']
    referenced.update(ids)
assert set(adj['reviewer_additions']) == set(features) - referenced
allowed = [core] + [c['source_region_xywh'] for c in ledger['edge_context']]
for f in features.values():
    assert f['source_text'] and f['search_text']
    assert f['transcription']['status'] in ('clear', 'tentative')
    assert f['historical_site_geometry'] is None and f['placement_status'] == 'unlocated' and f['gazetteer_matches'] == []
    ctx = f['source_context_crop_xywh']
    valid(ctx)
    assert inside(ctx, sheet)
    assert f['source_context_url'].endswith(','.join(map(str, ctx)) + '/full/0/default.jpg')
    for box in f['source_label_boxes_xywh']:
        valid(box)
        assert inside(box, ctx) and any(inside(box, e) for e in allowed), (f['id'], box)
old_boxes = {tuple(b) for f in old.values() for b in f['source_label_boxes_xywh']}
assert not old_boxes.intersection(tuple(b) for f in features.values() for b in f['source_label_boxes_xywh'])
for doc in [base / 'README.md', base.parent / 'judique-southeast-review.md', base.parent / 'README.md']:
    for target in re.findall(r'\]\(([^)]+)\)', doc.read_text()):
        if not target.startswith(('https:', 'http:', '#')):
            assert (doc.parent / target).exists(), target
area = union_area([d['source'].get('core_review_region_xywh', d['source'].get('pilot_region_xywh')) for d in previous] + [core])
assert area == 29_100_000
print(f'PASS: {len(candidates)} archived candidates, {len(structural_defects)} explicitly recorded raw bounds defects, {len(features)} reviewed additions, {len(old) + len(features)} unique inventory IDs, all candidate dispositions, hashes, complete core coverage and null site geometries. Core union: {area:,} pixels ({area / (sheet[2] * sheet[3]):.2%}).')
