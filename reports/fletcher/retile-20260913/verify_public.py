"""Check public delivery against the frozen inventory, without credentials."""
import argparse
import concurrent.futures
import hashlib
import json
import math
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--tiles', type=Path, required=True)
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
source = json.loads((a.tiles/'source.json').read_text())
root = 'https://tiles.kinnokilabs.com/' + source['revision']
items = json.loads((a.tiles/'tile-inventory.json').read_text())
inventory = {i['path']:i for i in items}
selected = {'source.json','tile-inventory.json'}
for z in range(8,16):
    candidates = [i for i in items if i['path'].startswith(str(z)+'/')]
    selected.add(max(candidates,key=lambda i:i['bytes'])['path'])
    selected.add(min(candidates,key=lambda i:i['bytes'])['path'])
for sheet in source['provenance']['sheets']:
    bounds = sheet['raster'].get('bounds')
    if not bounds:
        # Older status-derived receipts still link the complete raster's bounds.
        status = json.loads((Path(__file__).resolve().parents[3]/sheet['receipt']).read_text())
        bounds = status['raster_bounds_wgs84']
    points = bounds['coordinates'][0]
    lon = (min(p[0] for p in points)+max(p[0] for p in points))/2
    lat = (min(p[1] for p in points)+max(p[1] for p in points))/2
    for z in [13,15]:
        x = math.floor((lon+180)/360*2**z)
        y = math.floor((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z)
        rel = f'{z}/{x}/{y}.png'
        assert rel in inventory
        selected.add(rel)

def check(rel):
    request = urllib.request.Request(root+'/'+rel, headers={
        'Origin':'https://kinnokilabs.com',
        'User-Agent':'NSMarksTileVerification/1.0',
    })
    with urllib.request.urlopen(request,timeout=60) as response:
        body = response.read()
        expected = (a.tiles/rel).read_bytes()
        assert body == expected, rel
        content_type = response.headers.get_content_type()
        assert content_type == ('image/png' if rel.endswith('.png') else 'application/json'), (rel,content_type)
        if rel.endswith('.png'):
            assert response.headers.get('Access-Control-Allow-Origin') in ['*','https://kinnokilabs.com'], rel
        return {'path':rel,'status':response.status,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest(),'content_type':content_type,'cache_control':response.headers.get('Cache-Control'),'allow_origin':response.headers.get('Access-Control-Allow-Origin')}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(check,sorted(selected)))
a.out.write_text(json.dumps({'public_root':root,'verified_at':datetime.now(timezone.utc).isoformat(),'samples':results,'all_sample_bytes_match':True,'scope':'Both manifests, every zoom, opaque/transparent tiles and centre tiles for all 24 sheets. Complete R2 object verification is recorded separately in publication.json.'},indent=2)+'\n')
print('Public byte and header checks passed:',len(results))
