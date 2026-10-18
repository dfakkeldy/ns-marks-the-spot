from pathlib import Path
import json
D=Path('reports/fletcher/sheet07');d=json.loads((D/'validation-candidates.json').read_text())
for p in d['points']:
 p['pixel_xy']={'V01':[3050,2110],'V02':[2896,2401],'V03':[2848,1356]}[p['id']];p['review_note']='Native crosshair corrected to actual physical stream junction before first validation score; world location and frozen fit unchanged.';p['status']='Corrected fresh check pending exact crosshair review.'
(D/'validation.json').write_text(json.dumps(d,indent=2)+'\n')
