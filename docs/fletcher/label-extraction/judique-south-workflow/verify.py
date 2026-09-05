"""Audit this archived extraction batch. Run without Python's -O flag."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--crops', type=Path, help='Optional local directory of exact PNG crops')
args = parser.parse_args()
base = Path(__file__).resolve().parent
load = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
ledger = load(base / 'crops.json')
crops = {c['id']: c for c in ledger['crops']}
runs = load(base / 'runs.json')
adj = load(base / 'adjudication.json')
data = load(base.parent / 'judique-south.json')


def inside(box, extent):
    x, y, w, h = box
    ex, ey, ew, eh = extent
    return ex <= x and ey <= y and x + w <= ex + ew and y + h <= ey + eh


def valid(box):
    assert len(box) == 4 and all(type(n) is int for n in box)
    assert box[0] >= 0 and box[1] >= 0 and box[2] > 0 and box[3] > 0


def union_area(rects):
    xs = sorted({v for x, y, w, h in rects for v in (x, x + w)})
    area = 0
    for left, right in zip(xs, xs[1:]):
        intervals = sorted((y, y + h) for x, y, w, h in rects if x <= left and right <= x + w)
        covered = 0
        end = -1
        for low, high in intervals:
            covered += max(0, high - max(low, end))
            end = max(end, high)
        area += (right - left) * covered
    return area


sheet = [0, 0, *data['source']['source_dimensions_px']]
core = data['source']['core_review_region_xywh']
assert list(crops) == [f'S0{i}' for i in range(1, 7)]
assert data['coverage']['review_windows_xywh'] == [c['source_region_xywh'] for c in crops.values()]
assert data['coverage']['edge_context_windows_xywh'] == [c['source_region_xywh'] for c in ledger['edge_context']]
for c in crops.values():
    assert c['state'] == 'reviewed' and inside(c['source_region_xywh'], core)
assert union_area(data['coverage']['review_windows_xywh']) == core[2] * core[3]
for c in list(crops.values()) + ledger['edge_context']:
    valid(c['source_region_xywh'])
    assert inside(c['source_region_xywh'], sheet)
    if args.crops:
        assert sha(args.crops / c['image_filename']) == c['image_sha256']
assert ledger['source_mosaic_sha256'] == data['source']['native_mosaic_sha256']
receipt = load(base.parent / data['source']['native_mosaic_receipt'])
assert receipt['mosaic_sha256'] == ledger['source_mosaic_sha256']
assert receipt['dimensions_px'] == data['source']['source_dimensions_px']
assert sha(base / 'worker-prompt.txt') == runs['worker_prompt_sha256']
candidates = {}
seen_crops = []
for run in runs['runs']:
    raw = base / run['raw_output']
    assert sha(raw) == run['sha256']
    output = load(raw)
    assert output['model_requested'] == run['model_requested'] == 'gpt-5.6-sol'
    assert [c['crop_id'] for c in output['crops']] == run['crop_ids']
    for crop in output['crops']:
        cid = crop['crop_id']
        seen_crops.append(cid)
        assert [crop['width'], crop['height']] == crops[cid]['source_region_xywh'][2:]
        extent = [0, 0, crop['width'], crop['height']]
        for a in crop['annotations']:
            assert a['local_id'] not in candidates and a['local_id'].startswith(cid + '-')
            assert a['source_text'] and a['label_boxes_xywh']
            assert a['reading_status'] in ('clear', 'tentative', 'partial')
            candidates[a['local_id']] = (cid, a)
            for box in a['label_boxes_xywh']:
                valid(box)
                assert inside(box, extent)
        for region in crop['unresolved_regions']:
            valid(region['box_xywh'])
            assert inside(region['box_xywh'], extent)
assert sorted(seen_crops) == sorted(crops)
assert len(candidates) == adj['candidate_records'] == 29
features = {f['id']: f for f in data['features']}
assert len(features) == len(data['features']) == adj['reviewed_annotations'] == 23
assert sorted(features) == [f'F19-JUD-{i:03}' for i in range(71, 94)]
assert [r['accepted_annotation_id'] for r in adj['comparisons']] == list(features)
refs = Counter(cid for row in adj['comparisons'] for cid in row['candidate_ids'])
assert set(refs) == set(candidates) and set(refs.values()) == {1}
assert sum(not row['candidate_ids'] for row in adj['comparisons']) == 1
assert not runs['automatic_import_allowed'] and not adj['automatic_import_allowed']
for f in features.values():
    assert f['source_text'] and f['search_text'] and f['transcription']['status'] in ('clear', 'tentative')
    assert f['historical_site_geometry'] is None and f['placement_status'] == 'unlocated' and f['gazetteer_matches'] == []
    ctx = f['source_context_crop_xywh']
    valid(ctx)
    assert inside(ctx, sheet)
    suffix = ','.join(map(str, ctx)) + '/full/0/default.jpg'
    assert f['source_context_url'].endswith(suffix)
    for box in f['source_label_boxes_xywh']:
        valid(box)
        assert inside(box, ctx)
        assert inside(box, core) or any(inside(box, c['source_region_xywh']) for c in ledger['edge_context'])
previous = [load(base.parent / name) for name in ['judique-pilot.json', 'judique-inland.json']]
old_ids = [f['id'] for d in previous for f in d['features']]
assert len(old_ids) == len(set(old_ids)) == 70 and not set(old_ids).intersection(features)
old_boxes = {tuple(box) for d in previous for f in d['features'] for box in f['source_label_boxes_xywh']}
assert not old_boxes.intersection(tuple(box) for f in features.values() for box in f['source_label_boxes_xywh'])
for doc in [base / 'README.md', base.parent / 'README.md', base.parent / 'judique-south-review.md']:
    for target in re.findall(r'\]\(([^)]+)\)', doc.read_text()):
        if not target.startswith(('https:', 'http:', '#')):
            assert (doc.parent / target).exists(), target
print('PASS: 29 raw candidates mapped once, 23 reviewed annotations, 93 unique inventory IDs, six-window coverage, source bounds, raw hashes and null site geometry; optional nine crop hashes.')
