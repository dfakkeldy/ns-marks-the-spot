exec(open('reports/fletcher/sheet05/point_tools.py').read());import hashlib
pts=[]
for i,xy,k,e in [('V01',[4748,1655],'J0733','North Aspy River western tributary southwest of Big Southwest Brook'),('V02',[7470,2119],'J0888','Black Brook eastern tributary between Snipe and Doherty brooks')]:
 q=nodes[k].copy();q.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Fresh candidate selected after final eleven-control freeze; unreviewed.');pts.append(q)
(D/'validation-candidates.json').write_text(json.dumps(dict(sheet='sheet-05',fit_sha256=hashlib.sha256((D/'final-fit.json').read_bytes()).hexdigest(),points=pts),indent=2)+'\n')
