"""Dated MP names for the district inspector, from House of Commons open XML.

No contact channels, portraits or election results are copied. Constituency
names must match the pinned 2023-order boundaries exactly after whitespace trim.
"""
import datetime, hashlib, json, re, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
from html.parser import HTMLParser

XML='https://www.ourcommons.ca/members/en/search/xml?province=NS'
PAGE='https://www.ourcommons.ca/members/en/search?province=NS'
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links={}
    def handle_starttag(self,tag,attrs):
        href=dict(attrs).get('href','')
        m=re.search(r'/members/en/[^/]*\((\d+)\)$',href,re.I)
        if tag=='a' and m:self.links[m[1]]='https://www.ourcommons.ca'+href if href.startswith('/') else href

def main():
    raw=urllib.request.urlopen(XML,timeout=30).read(); html=urllib.request.urlopen(PAGE,timeout=30).read()
    links=Links();links.feed(html.decode())
    root=Path(__file__).resolve().parents[1]
    districts=json.loads((root/'public/elections/federal-ridings-2025.geojson').read_text())['features']
    names={f['properties']['ED_NAMEE'].strip():f['properties']['FED_NUM'] for f in districts}
    records={}; checked=datetime.datetime.now(datetime.timezone.utc).isoformat()
    for m in ET.fromstring(raw):
        riding=m.findtext('ConstituencyName').strip(); fid=names[riding]; pid=m.findtext('PersonId')
        if fid in records or pid not in links.links:raise ValueError('Missing profile or duplicate riding')
        records[fid]={'name':m.findtext('PersonOfficialFirstName')+' '+m.findtext('PersonOfficialLastName'),'constituency':riding,'officialPage':links.links[pid],'checkedAt':checked,'currentCaucus':m.findtext('CaucusShortName')}
    if len(records)!=11:raise ValueError('Review changed membership coverage')
    receipt={'source':XML,'sourcePage':PAGE,'sourceSha256':hashlib.sha256(raw).hexdigest(),'pageSha256':hashlib.sha256(html).hexdigest(),'checkedAt':checked,'boundaryVintage':'2023 Representation Order','attribution':'House of Commons, current members open data. Names and current caucus; not party at election.','records':records}
    (root/'src/elections/federalMembers.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
