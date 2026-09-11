from pathlib import Path
import json
D=Path('reports/fletcher/sheet05');p=json.loads((D/'validation-candidates.json').read_text());p['points']+=json.loads((D/'validation-additions.json').read_text())['points'];xy={'V01':[4748,1655],'V02':[7471,2134],'V03':[9190,1357],'V04':[9043,4527]}
for q in p['points']:
 q['initial_pixel_xy']=q['pixel_xy'];q['pixel_xy']=xy[q['id']];q['status']='Physical identity and wide context reviewed; exact final crosshair pending inspection before scoring.'
 q['limitation']='Local tributary order supports identity; modern tributary lengths and extra branches differ from historical depiction.'
(D/'validation.json').write_text(json.dumps(p,indent=2)+'\n')
