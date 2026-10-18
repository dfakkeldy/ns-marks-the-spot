from pathlib import Path
import json,subprocess
from collections import defaultdict
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.geometry import lonlat_to_mercator
r=Path(__file__).resolve().parent;files=[Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson'),Path('/Users/dfakkeldy/Downloads/church-south-extension-validation-20260916/extension-water-lines.geojson')];fs={};origins={};nodes=defaultdict(list)
for path in files:
 for f in json.loads(path.read_text())['features']:
  ident=f['properties']['OBJECTID']
  if ident not in fs:fs[ident]=f;origins[ident]=str(path)
for ident,f in fs.items():
 a=f['properties'];c=f['geometry']['coordinates']
 if a['FEAT_CODE']!='WARV50':continue
 for i in (0,len(c)-1):nodes[tuple(c[i][:2])].append(dict(feature_id=ident,vertex=i,name=a['RIVNAME_1'].strip(),reference_path=origins[ident]))
rows=[]
for ll,branches in nodes.items():
 names={b['name'] for b in branches if b['name']}
 if len(branches)>=3 and len(names)>=2 and -61.3<ll[0]<-60.94 and 45.60<ll[1]<45.73:rows.append(dict(lonlat=ll,branches=branches))
cs=load_gcps(Path('reports/church/richmond-south-seam-20260915/richmond-controls.csv'));inp=''.join('%s %s\n'%lonlat_to_mercator(*q['lonlat']) for q in rows);out=subprocess.check_output(['gdaltransform','-i','-order','1',*build_gcp_arguments(cs)],input=inp,text=True)
for q,line in zip(rows,out.splitlines(),strict=True):q['inverse_search_guide']=list(map(float,line.split()[:2]))
(r/'named-junction-search.json').write_text(json.dumps(rows,indent=2));print('Candidates:',len(rows))
for i,q in enumerate(rows):print(i,[b['name'] for b in q['branches']],q['lonlat'],q['inverse_search_guide'])
