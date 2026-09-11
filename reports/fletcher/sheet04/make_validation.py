exec(open('reports/fletcher/sheet04/point_tools.py').read())
import hashlib
pts=[]
for i,xy,k,e in [('V01',[2615,1425],'J0228','Historical Pine Brook northern tributary upstream of Black Brook'),('V03',[2042,4278],'J0618','Cameron Brook southern tributary west of C05'),('V04',[1920,6250],'J0821','Ingonish River western tributary above harbour')]:
 q=nodes[k].copy();q.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Fresh post-final-freeze proposal; exact crosshair and wide context pending inspection before scoring.');pts.append(q)
component=json.loads((D/'island-component-review.json').read_text())['coast_objectids'];q=min([r for r in rows if r['modern_objectid'] in component],key=lambda r:r['lonlat'][1]).copy();q.update(id='V02',role='check',pixel_xy=[3970,4405],identity_evidence='Ingonish Island southernmost shoreline',source_uncertainty_px=20,status='Fresh post-final-freeze proposal; exact crosshair and wide context pending inspection before scoring.');pts.append(q)
(D/'validation-candidates.json').write_text(json.dumps(dict(sheet='sheet-04',fit_sha256=hashlib.sha256((D/'final-fit.json').read_bytes()).hexdigest(),points=pts),indent=2)+'\n')
