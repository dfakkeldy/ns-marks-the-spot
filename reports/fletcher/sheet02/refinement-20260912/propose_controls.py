from pathlib import Path
import json,numpy as np
R=Path.cwd();D=R/'reports/fletcher/sheet02/refinement-20260912';E=Path.home()/'Downloads/fletcher-sheet02/refinement-20260912';data=E.parent
j=lambda p:json.loads(p.read_text());g=j(D.parent/'search-guide.json');known=g['intersections'];px=np.array([[a['pixel_x'],a['pixel_y']] for a in known]);ll=np.array([[g['meridians'][a['meridian_index']]['lon'],g['parallels'][a['parallel_index']]['lat']] for a in known]);guide=np.linalg.lstsq(np.c_[ll,np.ones(len(ll))],px,rcond=None)[0]
features=j(data/'reference-full/water-lines.geojson')['features'];found=[]
for f in features:
 if False:continue
 cc=f['geometry']['coordinates'];parts=[cc] if f['geometry']['type']=='LineString' else cc
 for i,part in enumerate(parts):
  for v,xy in enumerate(part):
   x,y=np.array([*xy[:2],1])@guide
   if 1430<x<1535 and 3340<y<3390:found.append((f['properties']['OBJECTID'],i,v,xy,[x,y]))
print('island objects',sorted(set(a[0] for a in found)))
for oid in sorted(set(a[0] for a in found)):
 f=next(f for f in features if f['properties']['OBJECTID']==oid);print(oid, f['geometry']['type'],f['properties'])
# Record only after checking all matching segments below.
(E/'island-search.json').write_text(json.dumps(found,indent=2)+'\n')
fs=[f for f in features if f['properties']['OBJECTID'] in [27682,27683]]
ends=[tuple(round(a,7) for a in xy[:2]) for f in fs for xy in [f['geometry']['coordinates'][0],f['geometry']['coordinates'][-1]]]
from collections import Counter
assert all(n==2 for n in Counter(ends).values()),ends
vertices=[(xy,f['properties']['OBJECTID'],v) for f in fs for v,xy in enumerate(f['geometry']['coordinates'])];xy,oid,v=min(vertices,key=lambda a:a[0][0])
p={'id':'R01','role':'candidate-control','pixel_xy':[1393,3275],'lonlat':xy[:2],'modern_objectid':oid,'modern_part':0,'modern_vertex':v,'modern_component_ids':[27682,27683],'identity_evidence':'Westernmost tip of the largest interior Middle Pond island, east-west two-lobed form with small island to its east and southwest. Entire two-segment closed modern coast-river-island shoreline checked. Pond entrances and barrier geometry are not this control.','source_uncertainty_px':20,'status':'Proposal awaiting exact native close/wide review; unscored.'}
nodes=j(E/'search/all-modern-nodes-anchored.json');n=next(n for n in nodes if n['id']=='J0305');r={**n,'modern_node_id':n['id'],'id':'R02','role':'candidate-control','pixel_xy':[3510,5250],'identity_evidence':'Candidate northern tributary on Rachel Brook upstream of Neils junction. Modern northern branch extends to a pond; native branch is very short. Must establish order/continuity, not merely similar position.','source_uncertainty_px':25,'status':'Proposal awaiting exact close/wide review; unscored.'}
(D/'candidate-controls.json').write_text(json.dumps({'sheet':'sheet-02','points':[p,r]},indent=2)+'\n')
