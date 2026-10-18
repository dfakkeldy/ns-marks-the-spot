exec(open('reports/fletcher/sheet04/point_tools.py').read())
p=json.loads((D/'candidate-diagnostics.json').read_text());bad=[];good=[]
for q in p['points']:
 if q['id']=='Q03':q['status']='Rejected and unscored';q['rejection_reason']='Initial pixel is offshore on the Mill label. The exact historical lake outlet and channel through the overprinted barrier are not established.';bad.append(q);continue
 q['initial_pixel_xy']=q['pixel_xy'];q['pixel_xy']={'Q01':[2155,4237],'Q02':[2629,3353]}[q['id']];q['status']='Physical identity and wide context reviewed; exact corrected crosshair pending inspection before scoring.';q['limitation']='Historical tributary length differs; local tributary order supports identity.' if q['id']=='Q01' else 'Historical lake shoreline and upstream meanders differ; named inlet is supported.';good.append(q)
p['points']=good;(D/'diagnostic.json').write_text(json.dumps(p,indent=2)+'\n');(D/'rejected-diagnostics.json').write_text(json.dumps(dict(sheet='sheet-04',points=bad),indent=2)+'\n')
