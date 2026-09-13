"""Fingerprint the live seats attributes without storing a provincial extract.

Print only metadata and a digest. Updating the checked-in receipt requires
reviewing the source's as-of claim; a successful fetch is not that review.
"""
import datetime, hashlib, json, urllib.request, urllib.parse
URL='https://nsgiwa.novascotia.ca/arcgis/rest/services/BND/BND_DistributionOfSeats_UT83/MapServer/0'
FIELDS=['ED_NO','ED_NAME','MLA','Party']
query=URL+'/query?'+urllib.parse.urlencode({'f':'json','where':'1=1','outFields':','.join(FIELDS),'returnGeometry':'false','orderByFields':'ED_NO'})
data=json.load(urllib.request.urlopen(query,timeout=30))
if data.get('exceededTransferLimit') or len(data['features'])!=56:raise ValueError('Incomplete source')
rows=sorted([[f['attributes'][k] for k in FIELDS] for f in data['features']],key=lambda r:r[0])
print(json.dumps({'sourceUrl':URL,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attributeFields':FIELDS,'sha256':hashlib.sha256(json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()},indent=2))
