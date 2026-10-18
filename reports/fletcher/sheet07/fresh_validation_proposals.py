exec(open('reports/fletcher/sheet07/point_tools.py').read())
import hashlib
h=hashlib.sha256((D/'repaired-fit.json').read_bytes()).hexdigest();pts=[]
for i,xy,k,e in [('V04',[2604,2269],'J0299','Morrison Brook northern tributary well upstream of fitted mouth and former V02'),('V05',[2144,4783],'J0496','Distinct brook coastal mouth north of the historical North Shore/French River mouth')]:
 r=nodes[k].copy();r.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Fresh post-repair candidate; no involvement in fit or initial diagnostics.');pts.append(r)
(D/'fresh-validation-candidates.json').write_text(json.dumps(dict(sheet='sheet-07',fit_sha256=h,points=pts),indent=2)+'\n')
for i in ['J0490','J0492','J0496']:print(i,nodes.get(i))
