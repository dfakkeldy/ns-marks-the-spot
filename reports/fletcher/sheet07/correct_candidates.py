exec(open('reports/fletcher/sheet07/point_tools.py').read())
p=json.loads((D/'candidate-controls.json').read_text());active=[];rejected=[]
placements={'C02':[3270,2316],'C03':[3125,2486],'C04':[2880,2897],'C05':[1932,2965],'C06':[2496,4030],'C07':[1546,3966],'C08':[2325,4359],'C09':[2074,5269],'C10':[1720,5926],'C11':[1525,5680]}
for q in p['points']:
 if q['id'] not in placements:
  q['status']='Rejected unscored: wider native and modern branching topology does not establish a reliable correspondence.'
  if q['id']=='C12':q['status']+=' Historical western pond inlet differs from proposed modern short northern tributary.'
  rejected.append(q);continue
 q['pixel_xy']=placements[q['id']]
 if q['id']=='C04':q.update(nodes['J0346']);q.update(id='C04',modern_node_id='J0346');q['identity_evidence']+=' Corrected from inner bank junction J0344 to coastal intersection J0346 before scoring; modern final reach is classified indefinite.'
 if q['id']=='C10':
  r=max([r for r in rows if r['modern_objectid'] in [125610,125611,125612]],key=lambda r:r['lonlat'][1]);q.update(r);q['identity_evidence']+=' Corrected from adjacent sea shoreline to northern tip of the connected lake shore, NSTDB WALK20 objects 125610/125611/125612.'
 q['status']='Corrected candidate; exact new crosshair to be personally reviewed before first fit.';active.append(q)
p['points']=active;(D/'corrected-candidates.json').write_text(json.dumps(p,indent=2)+'\n');(D/'rejected-controls.json').write_text(json.dumps(dict(points=rejected),indent=2)+'\n')
