from pathlib import Path
import json
D=Path('reports/fletcher/sheet07');d=json.loads((D/'fresh-validation-candidates.json').read_text())
for p in d['points']:
 p['pixel_xy']={'V04':[2605,2281],'V05':[2146,4815]}[p['id']];p['review_note']='Corrected from nearby native branch/shore to exact physical junction or mouth before any fresh score; modern coordinates unchanged.';p['status']='Fresh corrected check pending final crosshair inspection.'
(D/'fresh-validation.json').write_text(json.dumps(d,indent=2)+'\n')
