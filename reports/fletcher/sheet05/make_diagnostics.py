exec(open('reports/fletcher/sheet05/point_tools.py').read())
import hashlib
h=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest();pts=[]
for i,xy,k,e in [('Q01',[7689,4110],'J1879','Clyburn Brook upper northern tributary at Gorge bend'),('Q02',[1492,1264],'J0692','Fishing Cove River short western tributary north of fitted southwestern branch')]:
 q=nodes[k].copy();q.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Diagnostic candidate selected after initial eleven-control freeze; unreviewed.');pts.append(q)
(D/'candidate-diagnostics.json').write_text(json.dumps(dict(sheet='sheet-05',fit_sha256=h,points=pts),indent=2)+'\n')
