"""Fetch the highway and bridge sublayers omitted from the initial comparison.

Uses the original reference envelope. Saves a separate pilot receipt rather
than changing the frozen matching benchmark or georeferencing inputs.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
BASE = 'https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Roads_UT83/MapServer'

def request(url, params):
    with urlopen(url + '?' + urlencode(params), timeout=40) as response:
        data = json.load(response)
    if 'error' in data:
        raise RuntimeError(data['error'])
    return data

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    receipts = []
    for name, layer in [('highways', 7), ('bridges', 5)]:
        url = f'{BASE}/{layer}/query'
        envelope = dict(geometry='-61.62,45.74,-61.20,46.12', geometryType='esriGeometryEnvelope', inSR=4326, spatialRel='esriSpatialRelIntersects')
        result = request(url, dict(**envelope, returnIdsOnly='true', f='json'))
        ids = sorted(result['objectIds'] or [])
        assert ids, f'{name}: unexpected empty reference result'
        fields = 'OBJECTID,RTE_NO,STREET,FEAT_DESC,ROADSEGID,DATE_ACT,DATE_REV'
        features = []
        for offset in range(0, len(ids), 500):
            page = request(url, dict(objectIds=','.join(map(str, ids[offset:offset+500])), outSR=4326, outFields=fields, returnGeometry='true', f='geojson'))
            assert page['type'] == 'FeatureCollection' and not page.get('exceededTransferLimit')
            features.extend(page['features'])
        assert sorted(f['properties']['OBJECTID'] for f in features) == ids
        features.sort(key=lambda f:f['properties']['OBJECTID'])
        file = args.out / (name + '.geojson')
        file.write_text(json.dumps(dict(type='FeatureCollection', features=features), ensure_ascii=False)+'\n')
        highway19 = [f['properties']['OBJECTID'] for f in features if f['properties']['RTE_NO'] == 19]
        receipts.append(dict(name=name, url=url, bbox=envelope['geometry'], count=len(features), sha256=hashlib.sha256(file.read_bytes()).hexdigest(), retrieved_at=datetime.now(timezone.utc).isoformat(), query=envelope, outSR=4326, outFields=fields, highway19_object_ids=highway19))
        print(name, len(features), 'features;', len(highway19), 'Route 19 features')
    (ROOT/'road-context-receipts.json').write_text(json.dumps(receipts, indent=2)+'\n')

if __name__ == '__main__':
    main()
