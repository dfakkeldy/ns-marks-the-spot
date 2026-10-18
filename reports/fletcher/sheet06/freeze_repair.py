exec(open('reports/fletcher/sheet06/point_tools.py').read())
import hashlib,datetime,copy
p=json.loads((D/'reviewed-fit.json').read_text());d=json.loads((D/'diagnostic.json').read_text())
for qid,cid in [('Q01','C14'),('Q03','C15')]:
 q=copy.deepcopy(next(q for q in d['points'] if q['id']==qid));q.update(id=cid,role='control',promoted_from=qid,status='Failed diagnostic promoted unchanged; no longer independent validation.');p['points'].append(q)
p['method']='Ten-control regional TPS: original eight unchanged; failed Corney Q01 and island Q03 promoted unchanged. New validation must follow this freeze.';(D/'repaired-fit.json').write_text(json.dumps(p,indent=2)+'\n');h=hashlib.sha256((D/'repaired-fit.json').read_bytes()).hexdigest();(D/'repair-freeze.json').write_text(json.dumps(dict(fit_sha256=h,frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),control_ids=[q['id'] for q in p['points']],promotions=['Q01 to C14','Q03 to C15'],fresh_checks_not_collected_yet=True),indent=2)+'\n');(D/'repair-diagnostic.json').write_text(json.dumps(dict(fit_sha256=h,points=[q for q in d['points'] if q['id']=='Q02'],scope='Reused diagnostic only, not final fresh validation.'),indent=2)+'\n');print(h)
pts=[]
for i,xy,k,e in [('V01',[7803,6187],'J0555','Faribault Brook smaller southern tributary on southeastern main arm'),('V02',[8277,6216],'J0522','Daphiné Brook first eastern tributary south of Chéticamp River'),('V03',[8280,2305],'J0153','Jumping Brook southern tributary upstream of the first coastal tributary')]:
 r=nodes[k].copy();r.update(id=i,role='check',pixel_xy=xy,modern_node_id=k,identity_evidence=e,source_uncertainty_px=20,status='Fresh candidate collected after ten-control freeze, not yet reviewed.');pts.append(r)
(D/'validation-candidates.json').write_text(json.dumps(dict(sheet='sheet-06',fit_sha256=h,points=pts),indent=2)+'\n')
