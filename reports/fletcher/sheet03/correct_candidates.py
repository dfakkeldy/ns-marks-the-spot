exec(open('reports/fletcher/sheet03/point_tools.py').read())
p=json.loads((D/'candidate-controls.json').read_text());out=[];reject=[]
fix={'C01':[940,6075],'C02':[3165,5364],'C03':[2815,5340],'C04':[3497,4411],'C05':[7659,2980],'C06':[7814,3222],'C07':[8198,2003]}
for q in p['points']:
 if q['id'] not in fix:q['rejection_reason']='Initial native point lies on report lettering, not river. Wide review does not establish the proposed North Aspy junction or branch ordering; unscored.';reject.append(q);continue
 q['original_pixel_xy']=q['pixel_xy'];q['pixel_xy']=fix[q['id']];q['status']='Corrected native junction; exact final crosshair pending review before fit.';q['identity_limitation']='Historical river widths, branch lengths and meanders differ; local named junction / relative branch order support identity, not whole-sheet accuracy.';out.append(q)
p['points']=out;(D/'corrected-candidates.json').write_text(json.dumps(p,indent=2)+'\n');(D/'rejected-controls.json').write_text(json.dumps(dict(points=reject),indent=2)+'\n')
