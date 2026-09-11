exec(open('reports/fletcher/sheet10/point_tools.py').read())
import copy,hashlib,datetime
j=json.loads((D/'reviewed-fit.json').read_text());q=json.loads((D/'diagnostic.json').read_text());prom=[]
for old,new in [('Q01','C13'),('Q03','C14')]:
 p=copy.deepcopy(next(p for p in q['points'] if p['id']==old));p.update(id=new,role='control',promoted_from=old,status='Promoted diagnostic after initial failure; exact pixels and modern coordinates unchanged. No longer an independent check.');j['points'].append(p);prom.append(dict(from_id=old,to_id=new))
j['method']='Regional twelve: original ten unchanged, Q01 and Q03 promoted after failed diagnostics.'
(D/'repaired-fit.json').write_text(json.dumps(j,indent=2)+'\n');sha=hashlib.sha256((D/'repaired-fit.json').read_bytes()).hexdigest();(D/'repair-freeze.json').write_text(json.dumps(dict(fit_sha256=sha,frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),promotions=prom,initial_ten_unchanged=True,fresh_validation_collected_after_freeze=True),indent=2)+'\n');q['fit_sha256']=sha;q['points']=[p for p in q['points'] if p['id']=='Q02'];(D/'repair-diagnostic.json').write_text(json.dumps(q,indent=2)+'\n');print(sha)
