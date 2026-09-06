"""Check the research artifact contract; this does not verify geography."""
from pathlib import Path
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]

def read(path):
    return json.loads(path.read_text())

def main():
    data = read(ROOT/'pilot.json')
    refs = {r['name']: r for r in data['modern_references']}
    assert {'highways', 'bridges'} <= refs.keys(), 'Road context must include the separate highway and bridge layers'
    for aid in ['F19-JUD-004', 'F19-JUD-005', 'F19-JUD-008', 'F19-JUD-015']:
        coastal_case = next(c for c in data['cases'] if c['annotation_id'] == aid)
        assert set(coastal_case['modern_context_object_ids']['highways']) & set(refs['highways']['highway19_object_ids']), f'Highway 19 must be drawn in {aid}'
    expected = {f'F19-JUD-{n:03}' for n in [4,5,8,15,21,61,77,78,79,94,103,117]}
    assert {c['annotation_id'] for c in data['cases']} == expected
    assert len(data['cases']) == 12
    inventories = REPO/'docs/fletcher/label-extraction'
    annotations = {a['id']:a for name in ['judique-pilot','judique-inland','judique-south','judique-southeast'] for a in read(inventories/(name+'.json'))['features']}
    assert len(annotations) == 133
    assert all(a['historical_site_geometry'] is None for a in annotations.values())
    assert sum(c['source_review']['source_anchor_xy'] is not None for c in data['cases']) == 8
    raw_checked = raw_unavailable = 0
    for c in data['cases']:
        original = annotations[c['annotation_id']]
        assert c['source_text'] == original['source_text']
        assert original['historical_site_geometry'] is None
        assert c['historical_site_geometry'] is None
        assert c['placement_status'] == 'candidate-area-only'
        assoc = c['source_review']
        xy = assoc['source_anchor_xy']
        if xy:
            assert assoc['status'] == 'supported-source-association'
            assert 0 <= xy[0] < 10815 and 0 <= xy[1] < 7549
        else:
            assert assoc['status'] == 'unresolved'
            assert c['search_centre_origin'] != 'reviewed-printed-symbol'
        for x,y,w,h in assoc['candidate_symbol_regions_xywh']:
            assert min(x,y) >= 0 and min(w,h) > 0
            assert x+w <= 10815 and y+h <= 7549
        poly = c['search_geometry']['coordinates'][0]
        assert len(poly) == 5 and poly[0] == poly[-1]
        assert all(-62 < ll[0] < -61 and 45 < ll[1] < 47 for ll in poly)
        ll=c['search_centre_lonlat']
        assert poly[0][0] < ll[0] < poly[1][0] and poly[0][1] < ll[1] < poly[2][1]
        for ref in c['external_records']:
            raw_path = Path(ref['raw_response_archive'])
            if raw_path.exists():
                assert hashlib.sha256(raw_path.read_bytes()).hexdigest() == ref['raw_response_sha256']
                raw_checked += 1
                raw=read(raw_path)
                row=next(f for f in raw['features'] if f['attributes']['geo_id']==ref['geo_id'])
                assert ref['geometry_lonlat'] == [row['geometry']['x'], row['geometry']['y']]
            else:
                raw_unavailable += 1
            assert ref['link_status'] == 'candidate-only'
            assert all(math.isfinite(v) for v in ref['geometry_lonlat'])
    for artifact in read(ROOT/'artifact-receipt.json')['artifacts']:
        path=ROOT/artifact['path']
        assert path.stat().st_size == artifact['bytes']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == artifact['sha256']
    assert hashlib.sha256((ROOT.parent/'visual-expansion/sheet-observations.json').read_bytes()).hexdigest() == data['observations_sha256']
    print(f'PASS: 12 review cases; 8 source anchors / 4 unresolved groups; 133 inventory geometries remain null; artifact receipts checked. Raw coordinate rows checked: {raw_checked}; unavailable: {raw_unavailable}.')

if __name__ == '__main__':
    main()
