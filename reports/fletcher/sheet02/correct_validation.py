from pathlib import Path
import json
D=Path('reports/fletcher/sheet02');p=json.loads((D/'validation-candidates.json').read_text())
for q in p['points']:
 q['original_pixel_xy']=q['pixel_xy'];q['pixel_xy']={'V01':[3778,3263],'V02':[2696,3728]}[q['id']];q['status']='Fresh coordinates corrected onto physical feature after close and wide review, before scoring; final crosshair pending inspection.'
 q['identity_limitation']='Historical island width / channel simplification and shoreline generalization differ; 20 native pixel uncertainty.'
(D/'validation.json').write_text(json.dumps(p,indent=2)+'\n')
