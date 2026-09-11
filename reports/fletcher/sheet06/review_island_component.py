exec(open('reports/fletcher/sheet06/point_tools.py').read())
from collections import defaultdict
adj=defaultdict(set);ends={}
for f in json.loads((L/'reference-full/water-lines.geojson').read_text())['features']:
 if not f['properties']['FEAT_CODE'].startswith('WACO'):continue
 cc=f['geometry']['coordinates'];parts=[cc] if f['geometry']['type']=='LineString' else cc;oid=f['properties']['OBJECTID'];ends[oid]=[tuple(round(v,6) for v in ll[:2]) for part in parts for ll in [part[0],part[-1]]]
 for e in ends[oid]:adj[e].add(oid)
seen={3841};todo=[3841]
while todo:
 for e in ends[todo.pop()]:
  for oid in adj[e]-seen:seen.add(oid);todo.append(oid)
r=max([r for r in rows if r['modern_objectid'] in seen],key=lambda r:r['lonlat'][1]);print(sorted(seen));print({k:v for k,v in r.items() if k!='modern_properties'})
(D/'island-component-review.json').write_text(json.dumps(dict(start_objectid=3841,coast_objectids=sorted(seen),northern_extremity=r,scope='Connected source coast component within reference query, used to verify northern tip; not whole-island completeness beyond query.'),indent=2)+'\n')
