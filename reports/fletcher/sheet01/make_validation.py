exec(open('reports/fletcher/sheet01/point_tools.py').read())
import hashlib
pts=[]
for i,xy,k,e in [('V01',[3880,4645],'J0058','Southern Lowland Cove stream mouth at road bend, next mouth south of promoted Q02'),('V02',[8400,5406],'J0140','Gulch Brook terminal channel at eastern coast, south of Money Point')]:
 q=nodes[k].copy();q.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Fresh post-repair-freeze proposal; exact native and modern context pending review.');pts.append(q)
(D/'validation-candidates.json').write_text(json.dumps(dict(sheet='sheet-01',fit_sha256=hashlib.sha256((D/'final-fit.json').read_bytes()).hexdigest(),points=pts),indent=2)+'\n')
