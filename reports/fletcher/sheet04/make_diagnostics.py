exec(open('reports/fletcher/sheet04/point_tools.py').read())
import hashlib
pts=[]
for i,xy,k,e in [('Q01',[2155,4245],'J0602','Cameron Brook southern tributary just east of C05'),('Q02',[2626,3346],'J0470','Warren Brook inlet at Warren Lake northwestern lobe'),('Q03',[2960,5680],'J0754','Freshwater Lake southeastern outlet toward sea')]:
 q=nodes[k].copy();q.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Post-freeze diagnostic proposal; exact crosshair and wide context pending inspection before scoring.');pts.append(q)
(D/'candidate-diagnostics.json').write_text(json.dumps(dict(sheet='sheet-04',fit_sha256=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest(),points=pts),indent=2)+'\n')
