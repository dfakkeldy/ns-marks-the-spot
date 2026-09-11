exec(open('reports/fletcher/sheet05/point_tools.py').read())
p=json.loads((D/'candidate-controls.json').read_text())
xy={'C01':[4803,1615],'C02':[7812,1701],'C03':[9319,1653],'C04':[7200,2326],'C05':[8991,4701],'C06':[8561,4820],'C07':[9000,4948],'C08':[1620,5844],'C09':[3961,6339],'C10':[3361,2080],'C11':[1505,1294]}
for q in p['points']:
 q['pixel_xy']=xy[q['id']]
 if q['id']=='C11':q.update(nodes['J0711']);q.update(id='C11',modern_node_id='J0711');q['identity_evidence']='Fishing Cove River southwestern tributary, corrected from eastern tributary J0713 before fitting.'
 q['status']='Corrected proposal; exact new crosshair pending inspection before fitting.'
 if q['id']=='C10':q['limitation']='Local main bend and upstream tributary order support identity; historical eastern arm is short, modern arm is longer and divided. Wider historical drainage is not accepted.'
p['points']=p['points'];(D/'corrected-candidates.json').write_text(json.dumps(p,indent=2)+'\n')
