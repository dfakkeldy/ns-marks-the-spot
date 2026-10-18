exec(open('reports/fletcher/sheet06/point_tools.py').read())
d=json.loads((D/'candidate-controls.json').read_text());active=[];rej=[]
placements={'C03':[8085,2398],'C04':[7867,2961],'C05':[8266,3300],'C06':[7770,3482],'C09':[8459,4632],'C11':[7817,5956],'C12':[8100,5916],'C13':[5757,5448]}
why={'C01':'Pigeon Cove proposal has no established modern fork/shoreline correspondence.','C02':'Historical George Brook and named modern Georges Brook have materially different surrounding coast and branching context; name alone does not prove identity.','C07':'Historical Jerome mouth is not clearly traceable through the coloured coastal strip; original crosshair is on land/road.','C08':'Proposed native point is on land; wider northern/eastern branch pattern does not establish the proposed modern junction.','C10':'Original native point is on land and proposed Robert mouth identity is not established at the modern inner channel junction.'}
for p in d['points']:
 if p['id'] not in placements:p['status']='Rejected unscored: '+why[p['id']];rej.append(p);continue
 p['pixel_xy']=placements[p['id']]
 if p['id']=='C05':p.update(nodes['J0227']);p.update(id='C05',modern_node_id='J0227');p['identity_evidence']+=' Corrected from smaller southeastern tributary J0223 to actual South Branch junction J0227 before scoring.'
 if p['id']=='C09':p.update(nodes['J0324']);p.update(id='C09',modern_node_id='J0324');p['identity_evidence']='Robert Brook smaller northwestern tributary, west of the next northern/eastern junction; corrected from J0320 to J0324 before scoring.'
 p['status']='Corrected physical-control proposal; exact new crosshair pending review.';active.append(p)
d['points']=active;(D/'corrected-candidates.json').write_text(json.dumps(d,indent=2)+'\n');(D/'rejected-controls.json').write_text(json.dumps(dict(points=rej),indent=2)+'\n')
