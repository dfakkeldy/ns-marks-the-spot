exec(open('reports/fletcher/sheet02/point_tools.py').read())
import hashlib
fs=json.loads((L/'reference-full/water-lines.geojson').read_text())['features'];fs=[f for f in fs if f['properties']['FEAT_CODE']=='WACOIS10'] if fs and 'FEAT_CODE' in fs[0]['properties'] else fs
lookup={f['properties']['OBJECTID']:f for f in fs};print(lookup[16918]['properties'])
# Connected shoreline endpoints, including all segments of the island.
def endpoints(f):
 c=f['geometry']['coordinates'];ps=[c] if f['geometry']['type']=='LineString' else c
 return {tuple(round(v,6) for v in p[:2]) for part in ps for p in [part[0],part[-1]]}
ids={16918};ends=endpoints(lookup[16918])
while True:
 more={i for i,f in lookup.items() if i not in ids and endpoints(f)&ends}
 if not more:break
 ids|=more
 for i in more:ends|=endpoints(lookup[i])
print('island component',sorted(ids));r=max([r for r in rows if r['modern_objectid'] in ids],key=lambda r:r['lonlat'][1]);r.update(id='V01',role='check',pixel_xy=[3771,3267],identity_evidence='White Point largest offshore island northern tip, complete connected shoreline component',modern_component_ids=sorted(ids),source_uncertainty_px=20,status='Fresh post-repair-freeze proposal; exact crosshair and context pending inspection.')
q=nodes['J0194'].copy();q.update(id='V02',role='check',pixel_xy=[2770,3750],modern_node_id='J0194',identity_evidence='Brook mouth immediately east of Black Head',source_uncertainty_px=20,status='Fresh post-repair-freeze proposal; exact crosshair and context pending inspection.')
(D/'validation-candidates.json').write_text(json.dumps(dict(sheet='sheet-02',fit_sha256=hashlib.sha256((D/'final-fit.json').read_bytes()).hexdigest(),points=[r,q]),indent=2)+'\n')
