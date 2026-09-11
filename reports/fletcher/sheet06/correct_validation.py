from pathlib import Path
import json,copy
D=Path('reports/fletcher/sheet06');p=json.loads((D/'validation-candidates.json').read_text());reject=copy.deepcopy(p['points'][0]);reject['rejection_reason']='Native crosshair lies at a short southern twig. The proposed modern southern branch is long and divided; the later east/south main-arm geometry does not establish this correspondence. No fresh error calculated; retained unscored.';(D/'rejected-validation.json').write_text(json.dumps(dict(points=[reject]),indent=2)+'\n')
pts=[]
for i,xy,reason in [('V02',[8254,6208],'Move west to the first southern branch junction. Northern outlet, eastern arm and next southeastern divided tributary agree in ordering; first southern branch is much shorter historically, retained as a morphology limitation.'),('V03',[8310,2306],'Move east onto the southern tributary at the Fall label. This follows the lower coastal tributary and precedes the next upstream fork. Later tributary orientations and lengths differ; this is a local fork correspondence only.')]:
 q=copy.deepcopy(next(q for q in p['points'] if q['id']==i));q.update(pixel_xy=xy,initial_pixel_xy=q['pixel_xy'],review_note=reason,status='Exact native crosshair and wide modern topology reviewed before scoring.');pts.append(q)
p['points']=pts;(D/'validation.json').write_text(json.dumps(p,indent=2)+'\n')
