exec(open('reports/fletcher/sheet08/point_tools.py').read())
import hashlib,datetime
p=json.loads((D/'reviewed-fit.json').read_text());p.update(source_width=10812,source_height=7622,method='Nine reviewed physical river junctions; printed grid used only for search; no reservoir shoreline controls.',prior_control_count=0);(D/'reviewed-fit.json').write_text(json.dumps(p,indent=2)+'\n');h=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest();(D/'initial-freeze.json').write_text(json.dumps(dict(fit_sha256=h,frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),control_ids=[q['id'] for q in p['points']],diagnostics_collected_after_freeze=True),indent=2)+'\n')
pts=[]
for i,xy,k,e in [('Q01',[2240,4480],'J2486','Coulmeach Brook major northern tributary'),('Q02',[4370,3780],'J2062','West Branch Indian Brook major northern tributary'),('Q03',[7737,5774],'J2950','Indian Brook smaller eastern tributary below the fitted major eastern tributary')]:
 r=nodes[k].copy();r.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Unreviewed diagnostic proposal');pts.append(r)
(D/'candidate-diagnostics.json').write_text(json.dumps(dict(sheet='sheet-08',fit_sha256=h,points=pts),indent=2)+'\n');print(h)
