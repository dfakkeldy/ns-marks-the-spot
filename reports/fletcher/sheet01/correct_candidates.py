from pathlib import Path
import json
D=Path('reports/fletcher/sheet01');p=json.loads((D/'candidate-controls.json').read_text());q=p['points'][-1];q['rejection_reason']='McDougall Pond identity is broadly recognizable but the historical smooth southern lobe does not identify a stable vertex on the modern irregular coastal shoreline. Rejected unscored after close/wide review.';(D/'rejected-candidates.json').write_text(json.dumps(dict(points=[q]),indent=2)+'\n');p['points']=p['points'][:-1]
fix={'C01':[4411,3844],'C02':[4247,3983],'C03':[4444,4474],'C04':[5740,4390],'C05':[8200,4077],'C06':[8798,4665],'C07':[6234,5162]}
for q in p['points']:q['original_pixel_xy']=q['pixel_xy'];q['pixel_xy']=fix[q['id']];q['status']='Corrected proposal; exact crosshair pending inspection before fitting.';q['identity_limitation']='Historical coastal generalization and channel geometry differ; 20 native pixel uncertainty. Modern cape vertices checked against complete selected coast segments.'
(D/'corrected-candidates.json').write_text(json.dumps(p,indent=2)+'\n')
