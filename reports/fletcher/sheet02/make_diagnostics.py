exec(open('reports/fletcher/sheet02/point_tools.py').read())
import hashlib
pts=[]
for i,xy,k,e in [('Q01',[4567,5440],'J0312','Trout Brook mouth at Hungry Cove / New Haven'),('Q02',[3965,5595],'J0354','Neils Brook northern tributary downstream of Rachel confluence')]:
 q=nodes[k].copy();q.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Post-freeze diagnostic proposal; exact native and modern context pending review.');pts.append(q)
(D/'candidate-diagnostics.json').write_text(json.dumps(dict(sheet='sheet-02',fit_sha256=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest(),points=pts),indent=2)+'\n')
