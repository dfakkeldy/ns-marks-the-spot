exec(open('reports/fletcher/sheet07/point_tools.py').read())
d=json.loads((D/'candidate-diagnostics.json').read_text());out=[];rej=[]
for p in d['points']:
 if p['id']=='Q03':p['status']='Rejected unscored: proposed modern point is a coastal contact on a partial lake shoreline, not a reliable counterpart of the historical southern pond tip. Wider review shows changed coastal-water geometry.';rej.append(p);continue
 if p['id']=='Q01':p['pixel_xy']=[1858,2924];p['identity_evidence']='Ferry Brook smaller western tributary upstream of fitted southwestern tributary; initial direction description corrected before scoring.'
 p['status']='Reviewed diagnostic; Q01 exact corrected crosshair pending inspection before first score.';out.append(p)
d['points']=out;(D/'diagnostic.json').write_text(json.dumps(d,indent=2)+'\n');(D/'rejected-diagnostics.json').write_text(json.dumps(dict(points=rej),indent=2)+'\n')
