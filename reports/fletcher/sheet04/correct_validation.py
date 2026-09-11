exec(open('reports/fletcher/sheet04/point_tools.py').read())
p=json.loads((D/'validation-candidates.json').read_text());good=[];bad=[]
for q in p['points']:
 if q['id']=='V04':q['status']='Rejected and unscored';q['rejection_reason']='Initial pixel lies on land at the McKinnon label. Historical short southern branches do not establish the proposed modern western-arm confluence; main/tributary topology differs.';bad.append(q);continue
 q['initial_pixel_xy']=q['pixel_xy'];q['pixel_xy']={'V01':[2617,1420],'V02':[3987,4407],'V03':[2038,4278]}[q['id']];q['status']='Physical identity and wide context reviewed; exact final crosshair pending inspection before scoring.';q['limitation']='Broad historical island outline differs from detailed modern shoreline.' if q['id']=='V02' else 'Local tributary order supports identity; historical arms are shorter and modern branch shapes differ.';good.append(q)
p['points']=good;(D/'validation.json').write_text(json.dumps(p,indent=2)+'\n');(D/'rejected-validation.json').write_text(json.dumps(dict(sheet='sheet-04',points=bad),indent=2)+'\n')
