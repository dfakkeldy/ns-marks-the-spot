exec(open('reports/fletcher/sheet08/point_tools.py').read())
import copy,hashlib,datetime
p=json.loads((D/'reviewed-fit.json').read_text());q=json.loads((D/'diagnostic.json').read_text());c=copy.deepcopy(q['points'][0]);c.update(id='C12',role='control',promoted_from='Q01',status='Promoted after initial 1855.418102 m TPS diagnostic failure; coordinates unchanged. No longer independent.');p['points'].append(c);p['method']='Ten controls: original nine unchanged plus Coulmeach Q01 promoted after failed diagnostic.';(D/'repaired-fit.json').write_text(json.dumps(p,indent=2)+'\n');h=hashlib.sha256((D/'repaired-fit.json').read_bytes()).hexdigest();(D/'repair-freeze.json').write_text(json.dumps(dict(fit_sha256=h,frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),promotions=[dict(from_id='Q01',to_id='C12')],initial_nine_unchanged=True,fresh_validation_collected_after_freeze=True),indent=2)+'\n');q['points']=q['points'][1:];q['fit_sha256']=h;(D/'repair-diagnostic.json').write_text(json.dumps(q,indent=2)+'\n');print(h)
for k in ['J0708','J2486']:
 x,y=nodes[k]['source_guide_xy'];print(k)
 for r in nodes.values():
  xx,yy=r['source_guide_xy']
  if abs(xx-x)<140 and 0<yy-y<180:print(r)
