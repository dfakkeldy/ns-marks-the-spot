from pathlib import Path
import json,copy,hashlib
from collections import defaultdict,deque
D=Path('reports/fletcher/sheet04/refinement-20260912');E=Path.home()/'Downloads/fletcher-sheet04';fs=json.loads((E/'reference-full/water-lines.geojson').read_text())['features'];segments={};ends=defaultdict(set)
for f in fs:
 if f['properties']['FEAT_CODE']=='WACO20':
  g=f['geometry'];ps=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
  for i,p in enumerate(ps):
   key=(f['properties']['OBJECTID'],i);segments[key]=(f,p)
   for ll in [p[0],p[-1]]:ends[tuple(round(x,6) for x in ll[:2])].add(key)
seed=(8513,0);component={seed};todo=[seed]
while todo:
 k=todo.pop();f,p=segments[k]
 for ll in [p[0],p[-1]]:
  for j in ends[tuple(round(x,6) for x in ll[:2])]-component:component.add(j);todo.append(j)
assert any(k[0]==8071 for k in component)
rows=[]
for k in component:
 f,part=segments[k]
 for vi,ll in enumerate(part):
  if -.38-60<ll[0]<-60.347 and 46.65<ll[1]<46.66:rows.append({'lonlat':ll[:2],'modern_objectid':k[0],'modern_part':k[1],'modern_vertex':vi,'modern_properties':f['properties']})
p=max(rows,key=lambda p:p['lonlat'][0]);p.update(id='R01',role='check',pixel_xy=[3864,5163],identity_evidence='Middle Head easternmost mainland shore, excluding detached offshore islands',source_uncertainty_px=20,status='New mainland identity proposal, unscored and awaiting native/modern close/wide review.',selection_lonlat_box=[-60.38,46.65,-60.347,46.66],selection_axis=0,selection_direction='max')
w=lambda n,o:(D/n).write_text(json.dumps(o,indent=2)+'\n');w('repair-proposals.json',{'sheet':'sheet-04','points':[p]});w('mainland-component-review.json',{'seed_objectid':8513,'classification':'WACO20 mainland coastline only, excluding WACOIS10','endpoint_rounding_degrees':1e-6,'component_objectids':sorted(set(k[0] for k in component)),'component_reaches_western_peninsula_object_8071':True,'selection':p,'source':'sheet04/reference-receipts.json','method':'Connected shoreline endpoint graph; maximum longitude within the specified Middle Head box. No fitted coordinates used.'});print(json.dumps(p,indent=2))
