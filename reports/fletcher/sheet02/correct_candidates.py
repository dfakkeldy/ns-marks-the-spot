exec(open('reports/fletcher/sheet02/point_tools.py').read())
p=json.loads((D/'candidate-controls.json').read_text());fix={'C01':[1632,1121],'C02':[4914,4691],'C03':[3788,3393],'C04':[2692,3633],'C05':[4623,5824],'C06':[3788,5453],'C07':[3340,6111],'C08':[2665,6148]}
for q in p['points']:
 q['original_pixel_xy']=q['pixel_xy'];q['pixel_xy']=fix[q['id']]
 if q['id']=='C04':
  old=q.copy();r=max([r for r in rows if r['modern_objectid']==2829],key=lambda r:r['lonlat'][1]);q.update(r);q['original_modern_selection']=dict(lonlat=old['lonlat'],modern_objectid=old['modern_objectid'],modern_vertex=old['modern_vertex']);q['correction_reason']='Initial search window clipped the headland north edge; use northernmost vertex of the complete headland coast segment 2829.'
 q['status']='Corrected proposal; exact final native and modern crosshair pending inspection.'
 q['identity_limitation']='Historical river widths, branch lengths or shoreline detail differ. Local physical identity is provisional, not whole-sheet acceptance.'
p['points'].sort(key=lambda q:q['id']);(D/'corrected-candidates.json').write_text(json.dumps(p,indent=2)+'\n')
