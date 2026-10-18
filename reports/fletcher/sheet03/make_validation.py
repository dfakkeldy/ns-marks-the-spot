exec(open('reports/fletcher/sheet03/point_tools.py').read())
import hashlib
pts=[]
for i,xy,k,e in [('V01',[8219,1980],'J0275','Wilkie Brook first eastern tributary upstream of C07'),('V02',[7713,2846],'J0499','North Branch Brook eastern tributary downstream of Whiskey Den junction')]:
 q=nodes[k].copy();q.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Fresh post-final-freeze proposal; exact native crosshair and wide context pending review.');pts.append(q)
(D/'validation-candidates.json').write_text(json.dumps(dict(sheet='sheet-03',fit_sha256=hashlib.sha256((D/'final-fit.json').read_bytes()).hexdigest(),points=pts),indent=2)+'\n')
