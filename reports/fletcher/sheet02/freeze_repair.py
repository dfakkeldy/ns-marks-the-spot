from pathlib import Path
import json,hashlib,datetime
D=Path('reports/fletcher/sheet02')
f=json.loads((D/'reviewed-fit.json').read_text());q=json.loads((D/'diagnostic-checks.json').read_text())['points'][0];q.update(id='C09',role='control',promoted_from='Q01',status='Personally inspected corrected mouth; promoted without coordinate changes after initial TPS error 322.87759872184046 m.');f['points'].append(q);f['method']='Nine reviewed physical controls; Q01 promoted unchanged after failed initial diagnostic. Complete extent remains unaccepted.'
(D/'final-fit.json').write_text(json.dumps(f,indent=2)+'\n');h=hashlib.sha256((D/'final-fit.json').read_bytes()).hexdigest();(D/'final-freeze.json').write_text(json.dumps(dict(fit_sha256=h,frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),preserved_initial_controls=8,promotions=['Q01 to C09'],promotion_coordinates_unchanged=True,new_validation_not_collected_yet=True),indent=2)+'\n');print(h)
