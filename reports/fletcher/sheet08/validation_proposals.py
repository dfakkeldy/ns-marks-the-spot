exec(open('reports/fletcher/sheet08/point_tools.py').read())
import hashlib
pts=[]
for i,xy,k,e in [('V01',[8132,1227],'J0592','Short northern tributary to Ingonish River near fitted southern tributary'),('V02',[9157,1308],'J0745','Fork on southern McKinnon tributary below its fitted mouth'),('V03',[2360,4598],'J2501','Southern tributary on Coulmeach Brook downstream of fitted northern tributary')]:
 r=nodes[k].copy();r.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Fresh validation proposal collected after ten-control freeze; requires visual review before first score.');pts.append(r)
(D/'candidate-validation.json').write_text(json.dumps(dict(sheet='sheet-08',fit_sha256=hashlib.sha256((D/'repaired-fit.json').read_bytes()).hexdigest(),points=pts),indent=2)+'\n')
