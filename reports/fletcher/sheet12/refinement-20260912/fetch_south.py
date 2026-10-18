"""Extend the previous NSTDB reference envelope over all southern extensions.
Adapted from placement-pilot/fetch_road_context.py; preserve original extracts.
"""
import json, hashlib
from pathlib import Path
from datetime import datetime,timezone
from urllib.request import urlopen
from urllib.parse import urlencode
HERE=Path(__file__).resolve().parent
DATA=Path.home()/'Downloads/fletcher-sheet12'
OUT=DATA/'refinement-20260912/reference';OUT.mkdir(parents=True,exist_ok=True)
BASE='https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/'
def req(url,p):
 with urlopen(url+'?'+urlencode(p),timeout=40) as r:d=json.load(r)
 if 'error' in d:raise RuntimeError(d['error'])
 return d
receipts=[]
for name,service,layer in [('water-lines','BASE_NSTDB_10k_Water_WM84',4),('roads','BASE_NSTDB_10k_Roads_UT83',8)]:
 url=f'{BASE}{service}/MapServer/{layer}/query';env=dict(geometry='-60.88,46.045,-60.44,46.105',geometryType='esriGeometryEnvelope',inSR=4326,spatialRel='esriSpatialRelIntersects')
 ids=sorted(req(url,dict(**env,returnIdsOnly='true',f='json'))['objectIds'] or []);assert ids
 features=[]
 for i in range(0,len(ids),500):
  page=req(url,dict(objectIds=','.join(map(str,ids[i:i+500])),outSR=4326,outFields='*',returnGeometry='true',f='geojson'))
  assert page['type']=='FeatureCollection' and not page.get('exceededTransferLimit');features+=page['features']
 assert sorted(f['properties']['OBJECTID'] for f in features)==ids
 raw=OUT/(name+'-south.geojson');raw.write_text(json.dumps(dict(type='FeatureCollection',features=features))+'\n')
 prior=DATA/'reference-full'/f'{name}.geojson';merged={f['properties']['OBJECTID']:f for f in json.loads(prior.read_text())['features']};conflicts=[]
 for f in features:
  oid=f['properties']['OBJECTID']
  if oid in merged and merged[oid]['geometry']!=f['geometry']:conflicts.append(oid)
  else:merged[oid]=f
 # Preserve old geometry if overlapping service records changed; never silently revise frozen reference.
 output=OUT/f'{name}.geojson';output.write_text(json.dumps(dict(type='FeatureCollection',features=list(merged.values())))+'\n')
 h=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
 receipts.append(dict(name=name,url=url,query=env,returned_count=len(ids),at_utc=datetime.now(timezone.utc).isoformat(),axis_order='longitude, latitude',crs='EPSG:4326',south_path=str(raw),south_sha256=h(raw),prior_path=str(prior),prior_sha256=h(prior),combined_path=str(output),combined_sha256=h(output),changed_overlap_ids_retained_old=conflicts))
 print(name,len(ids),len(merged),'conflicts',conflicts,flush=True)
(HERE/'south-reference-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
