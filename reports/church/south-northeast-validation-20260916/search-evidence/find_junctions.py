from pathlib import Path
import json,subprocess
from collections import defaultdict
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.geometry import lonlat_to_mercator
r=Path('/Users/dfakkeldy/Downloads/church-south-northeast-validation-20260916');d=json.load(open('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson'));nodes=defaultdict(list)
for f in d['features']:
 a=f['properties'];c=f['geometry']['coordinates']
 if a['FEAT_CODE']!='WARV50':continue
 for i in (0,len(c)-1):nodes[tuple(c[i][:2])].append(dict(feature_id=a['OBJECTID'],vertex=i,name=a['RIVNAME_1'].strip()))
rows=[]
for ll,fs in nodes.items():
 names={p['name'] for p in fs if p['name']}
 if len(fs)>=3 and len(names)>=2 and -61.1<ll[0]<-60.85 and 46.24<ll[1]<46.44:rows.append(dict(lonlat=ll,branches=fs))
cs=load_gcps(Path('reports/church/south-coast-validation-20260916/controls.csv'))
inp=''.join('%s %s\n'%lonlat_to_mercator(*q['lonlat']) for q in rows)
out=subprocess.check_output(['gdaltransform','-i','-tps',*build_gcp_arguments(cs)],input=inp,text=True)
for q,line in zip(rows,out.splitlines(),strict=True):q['inverse_search_guide']=list(map(float,line.split()[:2]))
(r/'named-junction-search.json').write_text(json.dumps(rows,indent=2));print('Candidates:',len(rows))
for i,q in enumerate(rows):print(i,[v['name'] for v in q['branches']],q['lonlat'],q['inverse_search_guide'])
