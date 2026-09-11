exec(open('reports/fletcher/sheet07/point_tools.py').read())
import hashlib,datetime
p=json.loads((D/'corrected-candidates.json').read_text())
for q in p['points']:q['status']='Exact native and modern corrected crosshairs personally reviewed; retained for initial fit, geographic accuracy unaccepted.'
p.update(source_width=10821,source_height=7693,method='Ten reviewed coastal mouths, inland junctions and a pond tip. Prior approximate printed grid is search-only; physical controls occupy the western strip.',prior_control_count=0)
(D/'reviewed-fit.json').write_text(json.dumps(p,indent=2)+'\n');h=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest();(D/'initial-freeze.json').write_text(json.dumps(dict(fit_sha256=h,frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),control_ids=[q['id'] for q in p['points']],diagnostics_collected_after_freeze=True),indent=2)+'\n');print(h)
pts=[]
for i,xy,k,e in [('Q01',[1850,2925],'J0349','Ferry Brook smaller northern tributary upstream of fitted southwestern tributary'),('Q02',[1558,3974],'J0427','Mill Brook second southern tributary just downstream of fitted southwestern tributary')]:
 r=nodes[k].copy();r.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Unreviewed diagnostic proposal');pts.append(r)
r=min([r for r in rows if r['modern_objectid'] in [125610,125611,125612]],key=lambda r:r['lonlat'][1]).copy();r.update(id='Q03',role='check',pixel_xy=[1650,6090],identity_evidence='Southern extremity of large coastal pond at Breeding Cove',source_uncertainty_px=20,status='Unreviewed diagnostic proposal');pts.append(r)
(D/'candidate-diagnostics.json').write_text(json.dumps(dict(sheet='sheet-07',fit_sha256=h,points=pts),indent=2)+'\n')
