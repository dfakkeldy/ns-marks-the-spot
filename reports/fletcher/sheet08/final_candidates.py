exec(open('reports/fletcher/sheet08/point_tools.py').read())
p=json.loads((D/'corrected-candidates.json').read_text())
for q in p['points']:
 if q['id']=='C03':
  q.update(nodes['J1256']);q['id']='C03';q['modern_node_id']='J1256';q['identity_evidence']+=' J1250 was the nearby southwest bank/tributary junction; corrected to eastern arm confluence J1256 before any scoring.'
 q['status']='Native close and wider context personally reviewed; proposed physical control, geographic performance not yet tested.'
(D/'reviewed-fit.json').write_text(json.dumps(p,indent=2)+'\n')
