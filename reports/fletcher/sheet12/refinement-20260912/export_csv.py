"""Export native-frame controls and separate check rows using the app's exact schema."""
from pathlib import Path
import json,csv
D=Path(__file__).resolve().parent
for prefix,fit,diagnostics,validation in [('sixteen-', 'repaired-fit.json','repair-diagnostic.json','validation.json'),('', 'final-fit.json','final-diagnostic.json','final-validation.json')]:
 controls=json.loads((D/fit).read_text())['points']
 for kind,extra in [('controls',[]),('diagnostic-review',json.loads((D/diagnostics).read_text())['points']),('validation-review',json.loads((D/validation).read_text())['points'])]:
  with (D/f'{prefix}sheet-12-{kind}.csv').open('w',newline='') as f:
   writer=csv.writer(f,lineterminator="\n");writer.writerow(['pixel_x','pixel_y','lon','lat','role','label'])
   for p in controls+extra:writer.writerow([*p['pixel_xy'],*p['lonlat'],p['role'],p['id']])
