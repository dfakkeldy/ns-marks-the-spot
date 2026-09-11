exec(open('reports/fletcher/sheet03/point_tools.py').read())
import hashlib
pts=[]
for i,xy,k,e in [('Q01',[7708,2798],'J0489','North Branch Brook / Whiskey Den Brook junction upstream of C05'),('Q02',[851,6017],'J1556','Fishing Cove River mouth at mainland shoreline')]:
 q=nodes[k].copy();q.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Post-freeze proposal; exact crosshair and wide context pending review before scoring.');pts.append(q)
(D/'candidate-diagnostics.json').write_text(json.dumps(dict(sheet='sheet-03',fit_sha256=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest(),points=pts),indent=2)+'\n')
