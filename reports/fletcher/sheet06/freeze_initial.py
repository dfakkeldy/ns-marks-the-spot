exec(open('reports/fletcher/sheet06/point_tools.py').read())
import hashlib,datetime
p=json.loads((D/'corrected-candidates.json').read_text())
for q in p['points']:q['status']='Exact corrected crosshairs personally inspected; retained initial control with geographic accuracy unaccepted.'
p.update(source_width=10739,source_height=7552,method='Eight reviewed physical river mouths, junctions and island tip. Prior printed grid is search-only.',prior_control_count=0);(D/'reviewed-fit.json').write_text(json.dumps(p,indent=2)+'\n');h=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest();(D/'initial-freeze.json').write_text(json.dumps(dict(fit_sha256=h,frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),control_ids=[q['id'] for q in p['points']],diagnostics_collected_after_freeze=True),indent=2)+'\n');print(h)
pts=[]
for i,xy,k,e in [('Q01',[8392,3340],'J0223','Corney Brook smaller southeastern tributary east of fitted South Branch'),('Q02',[7730,6158],'J0534','Faribault Brook main western/eastern-arm junction south of Chéticamp River')]:
 r=nodes[k].copy();r.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Unreviewed diagnostic proposal.');pts.append(r)
ids=json.loads((D/'island-component-review.json').read_text())['coast_objectids'];r=max([r for r in rows if r['modern_objectid'] in ids and 5450<r['guide_xy'][1]<5750],key=lambda r:r['lonlat'][0]).copy();r.update(id='Q03',role='check',pixel_xy=[6048,5600],identity_evidence='Eastern extremity of northern Chéticamp Island headland',source_uncertainty_px=20,status='Unreviewed diagnostic proposal.');pts.append(r)
(D/'candidate-diagnostics.json').write_text(json.dumps(dict(sheet='sheet-06',fit_sha256=h,points=pts),indent=2)+'\n')
