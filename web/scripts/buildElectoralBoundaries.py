"""Build NS-only display assets from explicitly open federal/municipal sources.

Run from any directory. Raw downloads stay in --cache, outside the repository.
Provincial BND/ENS material is deliberately not accepted by this generator.
"""
import argparse
import datetime
import hashlib
import io
import json
from pathlib import Path
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from html.parser import HTMLParser

EC = 'https://www.elections.ca/res/cir/mapsCorner/vector/'
EC_RECORD = 'https://open.canada.ca/data/en/dataset/97a2a33c-54cc-4f2e-82c1-047ad8212f05'
CANADA = 'https://open.canada.ca/en/open-government-licence-canada'
HALIFAX = 'https://data-hrm.hub.arcgis.com/pages/open-data-licence'
HRM = 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/PollingDistrict/FeatureServer/0'
NS = '{http://www.opengis.net/kml/2.2}'

class Cells(HTMLParser):
    def __init__(self):
        super().__init__(); self.values = []; self.cell = None
    def handle_starttag(self, tag, attrs):
        if tag == 'td': self.cell = ''
    def handle_data(self, value):
        if self.cell is not None: self.cell += value
    def handle_endtag(self, tag):
        if tag == 'td' and self.cell is not None:
            self.values.append(self.cell.strip()); self.cell = None

def kmz_features(data, polling):
    z = zipfile.ZipFile(io.BytesIO(data))
    root = ET.fromstring(z.read('doc.kml'))
    features = []
    for place in root.iter(NS+'Placemark'):
        table = Cells(); table.feed(place.findtext(NS+'description', ''))
        attrs = {key: table.values[i+1] for i, key in enumerate(table.values[:-1]) if key in {'FED_NUM','ED_NAMEE','ED_NAMEF','REPORDER','PD_NUM','PD_NBR_SFX','PD_TYPE','ADV_POLL_NUM'}}
        if not 12001 <= int(attrs.get('FED_NUM', 0)) <= 12011: continue
        keys = ['FED_NUM', 'PD_NUM', 'PD_NBR_SFX', 'PD_TYPE', 'ADV_POLL_NUM'] if polling else ['FED_NUM', 'ED_NAMEE', 'ED_NAMEF', 'REPORDER']
        props = {key: attrs[key] for key in keys}
        polygons = []
        for poly in place.iter(NS+'Polygon'):
            rings = []
            for kind in ['outerBoundaryIs', 'innerBoundaryIs']:
                for boundary in poly.findall(NS+kind):
                    raw = boundary.find('.//'+NS+'coordinates')
                    ring = [[float(n) for n in p.split(',')[:2]] for p in raw.text.split()]
                    if len(ring) < 4 or ring[0] != ring[-1]: raise ValueError('Invalid ring')
                    rings.append(ring)
            polygons.append(rings)
        if not polygons: raise ValueError('Missing polygon')
        fid = str(props['FED_NUM'])
        if polling: fid += ':'+props['PD_NUM']+'-'+props['PD_NBR_SFX']
        features.append({'type':'Feature', 'id':fid, 'properties':props, 'geometry':{'type':'MultiPolygon','coordinates':polygons}})
    # A riding can contain several placemarks (Halifax includes Sable Island).
    merged = {}
    for f in features:
        if f['id'] in merged:
            if f['properties'] != merged[f['id']]['properties']: raise ValueError('Conflicting duplicate ID')
            merged[f['id']]['geometry']['coordinates'].extend(f['geometry']['coordinates'])
        else: merged[f['id']] = f
    return list(merged.values())

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args(); args.cache.mkdir(parents=True, exist_ok=True)
    out = Path(__file__).resolve().parents[1]/'public'/'elections'; out.mkdir(exist_ok=True)
    receipt = {'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'purpose':'Project-derived NS display extracts; not official electoral records or a survey.', 'sources':[]}
    def fetch(url):
        path = args.cache/(hashlib.sha256(url.encode()).hexdigest()+'.raw')
        if not path.exists():
            path.write_bytes(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=120).read())
        data = path.read_bytes()
        return data, {'url':url,'sha256':hashlib.sha256(data).hexdigest(),'fetchedAt':datetime.datetime.fromtimestamp(path.stat().st_mtime,datetime.timezone.utc).isoformat()}
    def save(name, features, sources, licence, attribution, release, transformation):
        if not features or any(not f['geometry'] or not f['properties'] for f in features): raise ValueError('Empty data/attributes')
        data = (json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':'))+'\n').encode()
        (out/name).write_bytes(data)
        receipt['sources'].append({'asset':name,'sha256':hashlib.sha256(data).hexdigest(),'featureCount':len(features),'inputs':sources,'licenceUrl':licence,'attribution':attribution,'sourceDate':release,'transformation':transformation})
        print(name, len(features), len(data))
    for name, filename, polling, count in [('federal-ridings-2025.geojson','FederalElectoralDistricts_2025_KMZ.zip',False,11),('federal-polls-2025.geojson','PollingDivisionBoundaries_2025_KMZ.zip',True,2260)]:
        data, source = fetch(EC+filename); archive=zipfile.ZipFile(io.BytesIO(data))
        members = [n for n in archive.namelist() if n.endswith('.kmz') and ('PD_PE-NS-NB_2025_EN' in n if polling else True)]
        feats=[]
        for n in members: feats.extend(kmz_features(archive.read(n),polling))
        if len(feats) != count: raise ValueError(f'Expected {count}, got {len(feats)}')
        source['licenceEvidenceUrl']=EC_RECORD
        save(name,feats,[source],CANADA,'Elections Canada. Contains information licensed under the Open Government Licence – Canada.','2025-04-28; 2023 Representation Order','NS FED_NUM 12001–12011 only. KML description tables parsed. Multipart placemarks grouped by source ID. Coordinates preserved; EC simplified KMZ geometry. No inferred service areas for M/S polls.')
    url='https://data.novascotia.ca/resource/gcep-xeci.geojson?'+urllib.parse.urlencode({'$limit':'1000','$order':':id','$select':'simplify_preserve_topology(the_geom,0.00003) as the_geom,:id as source_row_id,co_code,mu_code,poll_dist,mun,reg_num'})
    data, source = fetch(url); feats=json.loads(data)['features']
    if len(feats)!=238: raise ValueError(f'Municipal count changed: {len(feats)}')
    for f in feats:
        f['properties']={k:f['properties'].get(k) for k in ['source_row_id','co_code','mu_code','poll_dist','mun','reg_num']}
    save('municipal-polling-districts.geojson',feats,[source],'https://novascotia.ca/opendata/licence.asp','Contains information licensed under the Open Government Licence – Nova Scotia.','Publisher regulations vary; current boundary-review parity unverified','Complete gcep-xeci view, source topology-preserving simplification 0.00003 degrees (at most 3.4 metres). Source row IDs and five identity fields retained. No current councillor assertion.')
    url=HRM+'/query?'+urllib.parse.urlencode({'f':'geojson','where':'1=1','outFields':'OBJECTID,DIST_ID,DISTNAME,SOURCE,SDATE','outSR':'4326','returnGeometry':'true'})
    data, source=fetch(url); j=json.loads(data); feats=j['features']
    if j.get('exceededTransferLimit') or len(feats)!=16: raise ValueError('Incomplete Halifax districts')
    source['licenceEvidenceUrl']='https://www.arcgis.com/sharing/rest/content/items/04c5bee564f84b4a8f1c8dd305896079?f=pjson'
    save('halifax-council-districts.geojson',feats,[source],HALIFAX,'Contains information licenced under the Open Government Licence—Halifax.','2024 districts; open-data item modified 2025-07-03','Complete official PollingDistrict service; outSR 4326. Source district IDs and dates retained; council contacts excluded.')
    (out/'source.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__': main()
