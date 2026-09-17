from pathlib import Path
import json,hashlib,datetime
from tools.fletcher.fetch_nstdb_extract import fetch,_get
C=Path(__file__).parent
url='https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Roads_UT83/MapServer/8'
bbox='-61.65,45.65,-60.87,46.42';pages=[]
metadata=_get(url,{'f':'json'});(C/'roads-service-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
def getter(u,p):
 p={**p,'orderByFields':'OBJECTID ASC'};r=_get(u,p);pages.append(dict(parameters=p,count=len(r.get('features',[])),exceededTransferLimit=r.get('exceededTransferLimit')));return r
r=fetch(url,bbox,getter);ids=[f['properties']['OBJECTID'] for f in r['features']];assert len(ids)==len(set(ids))
audit=_get(url+'/query',dict(geometry=bbox,geometryType='esriGeometryEnvelope',inSR='4326',spatialRel='esriSpatialRelIntersects',returnIdsOnly='true',f='json'));assert set(ids)==set(audit['objectIds'])
(C/'roads-id-audit.json').write_text(json.dumps(audit))
out=C/'roads.geojson';out.write_text(json.dumps(r))
(C/'roads-receipt.json').write_text(json.dumps(dict(url=url+'/query',bbox=bbox,count=len(ids),sha256=hashlib.sha256(out.read_bytes()).hexdigest(),retrieved=datetime.datetime.now(datetime.timezone.utc).isoformat(),crs='EPSG:4326',axis_order='longitude,latitude',method='Paged original geometry ordered by OBJECTID, with separate full ID-set audit; no clipping or simplification',pages=pages,path=str(out),id_audit_sha256=hashlib.sha256((C/'roads-id-audit.json').read_bytes()).hexdigest()),indent=2)+'\n')
print(len(ids),'unique original road features');print(r['features'][0]['properties'])
