exec(open('reports/fletcher/sheet07/point_tools.py').read())
import hashlib,datetime
h=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest()
(D/'final-freeze.json').write_text(json.dumps(dict(fit_sha256=h,frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),control_count=10,repair='No change after two diagnostic checks scored 29.78/44.01 m; neither check promoted. Fresh checks collected only after this final freeze.',fresh_checks_not_collected_yet=True),indent=2)+'\n')
pts=[]
for i,xy,k,e in [('V01',[3010,2087],'J0274','Pathend Brook northern tributary upstream of the mouth'),('V02',[2905,2395],'J0304','Morrison Brook southern tributary upstream of the mouth'),('V03',[2825,1350],'J0204','Northern interior brook fork with western and southwestern arms near the mapped pit')]:
 r=nodes[k].copy();r.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Fresh unreviewed validation candidate; ten controls remain frozen.');pts.append(r)
(D/'validation-candidates.json').write_text(json.dumps(dict(sheet='sheet-07',fit_sha256=h,points=pts),indent=2)+'\n')
