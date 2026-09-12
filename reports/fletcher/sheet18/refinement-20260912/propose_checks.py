from pathlib import Path
import json,hashlib,datetime
D=Path('reports/fletcher/sheet18/refinement-20260912');E=Path.home()/'Downloads/fletcher-sheet18/refinement-20260912';j=lambda p:json.loads(p.read_text());nodes=j(E/'search/all-modern-nodes-anchored.json');points=[]
for id,node,xy,identity in [('F01','J0318',[2135,1690],'Ashfield western brook eastern tributary joins north-south main branch above road crossing; distinct drainage west of repaired pond.'),('F02','J0383',[3450,2210],'Eastern Ashfield brook major northern tributary joins east-flowing southern main channel, east of repaired pond system.')]:
 n=next(n for n in nodes if n['id']==node);points.append({**n,'modern_node_id':n['id'],'id':id,'role':'check','pixel_xy':xy,'identity_evidence':identity,'source_uncertainty_px':20,'status':'Fresh post-freeze proposal; exact native/modern review pending.'})
(D/'fresh-candidates.json').write_text(json.dumps({'fit_sha256':hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest(),'selected_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'points':points},indent=2)+'\n')
