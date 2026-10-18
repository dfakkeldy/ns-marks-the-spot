exec(open('reports/fletcher/sheet01/point_tools.py').read())
import hashlib
pts=[]
for i,xy,k,e in [('Q01',[6410,6000],'J0251','Salmon River western tributary at southern main channel bend'),('Q02',[3870,4610],'J0045','Lowland Cove stream shoreline mouth west of historical Lowland / modern French Brook')]:
 q=nodes[k].copy();q.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Post-freeze diagnostic proposal; exact native and modern context pending review.');pts.append(q)
(D/'candidate-diagnostics.json').write_text(json.dumps(dict(sheet='sheet-01',fit_sha256=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest(),points=pts),indent=2)+'\n')
