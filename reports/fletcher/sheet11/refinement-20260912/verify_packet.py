"""Verify both experimental rounds, preserved controls, image frames and actual imports."""
from pathlib import Path
import json,hashlib,csv,subprocess
D=Path(__file__).resolve().parent;ROOT=D.parents[3];DATA=Path.home()/'Downloads/fletcher-sheet11'
r=lambda p:json.loads(p.read_text())
def h(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
old=r(D.parent/'completion-20260911/western-fit.json')['points'];figures=[];rounds=[]
for folder,n,nd in [(D,28,10),(D/'30-control',30,11)]:
 f=r(folder/'repaired-fit.json');v=r(folder/'validation.json');diag=r(folder/'reused-checks.json');freeze=r(folder/'repair-freeze.json');receipt=r(folder/'raster-receipt.json')
 assert f['points'][:len(old)]==old and len(f['points'])==n
 for p in f['points'][len(old):]:
  original=p['promotion']['old_point'];assert p['promotion']['old_result']['id']==original['id']
  for k in ['pixel_xy','lonlat']:assert p[k]==original[k]
  if n==30:
   assert original==next(q for q in r(D/'validation.json')['points'] if q['id']==original['id'])
   assert p['promotion']['old_result']==next(q for q in r(D/'validation-scores.json')['points'] if q['id']==original['id'])
 old=f['points']
 assert h(folder/'repaired-fit.json')==freeze['fit_sha256']==v['fit_sha256']==diag['fit_sha256']==receipt['fit_sha256']
 assert freeze['at_utc']<v['collected_at_utc']<v['review_completed_at_utc']
 assert h(DATA/'native/sheet11.png')==f['source_sha256']==freeze['source_sha256']==receipt['source_sha256']
 for boundary in receipt['boundaries']:assert h(Path(boundary['path']))==boundary['sha256']==next(x['sha256'] for x in freeze['boundaries'] if x['component']==boundary['component'])
 assert h(folder/'render.py')==receipt['script_sha256']
 assert all(x['nonnegative_determinants']==0 for x in receipt['orientation'])
 for key in ['pixel_xy','lonlat']:assert not {tuple(p[key]) for p in f['points']} & {tuple(p[key]) for p in v['points']+diag['points']}
 pairs=[(folder/'repaired-fit.json','validation','validation-scores'),(folder/'repaired-fit.json','reused-checks','diagnostic-scores'),(D.parent/'completion-20260911/western-fit.json','baseline-validation','baseline-validation-scores')]
 if n==30:pairs.append((D/'repaired-fit.json','prior28-validation','prior28-validation-scores'))
 for fit,checks,scores in pairs:
  s=r(folder/(scores+'.json'));assert h(fit)==s['fit_sha256'] and h(folder/(checks+'.json'))==s['checks_sha256']
 for kind,extra in [('controls',[]),('diagnostic-review',diag['points']),('validation-review',v['points'])]:
  rows=list(csv.DictReader((folder/f'sheet-11-{kind}.csv').open()));assert len(rows)==len(f['points'])+len(extra)
  for row,p in zip(rows,f['points']+extra):assert [float(row['pixel_x']),float(row['pixel_y'])]==p['pixel_xy'] and [float(row['lon']),float(row['lat'])]==p['lonlat'] and row['role']==p['role'] and row['label']==p['id']
 artifact=receipt['raster'];assert h(Path(artifact['path']))==artifact['sha256']
 coverage=r(folder/'coverage.json');assert coverage['raster_sha256']==artifact['sha256'] and coverage['passed'] and coverage['transparent_interior_cells']==0
 assert h(Path(artifact['path']).parent/'cutline.geojson')==coverage['cutline_sha256']==receipt['cutline_sha256']
 proof=r(folder/'browser/verification.json');mobile=r(folder/'browser/mobile-verification.json');assert proof['before']==proof['after'] and proof['enabledStateSurvived']
 for record in [proof['before'],mobile]:assert record['storedRasterSha256']==artifact['sha256'] and record['transparentPixels']>0 and record['opaquePixels']>0 and [record['record']['pixelSize']['width'],record['record']['pixelSize']['height']]==artifact['size']
 assert r(folder/'browser/errors.json')==[]
 for name in ['import-desktop.png','reload-desktop.png','reload-mobile.png']:
  p=folder/'browser'/name;figures.append({'path':str(p.relative_to(ROOT)),'sha256':h(p)})
 i=r(folder/'parser-verification.json');assert (i['controls'],i['checks'],i['validation_checks'])==(n,nd,3) and i['semantic_csv_roundtrip'] and i['maximum_web_gdal_difference_projected_m']<.001
 rounds.append({'controls':n,'reused_checks':nd,'fresh_checks':3,'raster':artifact})
for p in r(D/'baseline-verification.json')['files']:assert h(Path(p['path']))==p['sha256']
subprocess.run(['git','merge-base','--is-ancestor',r(D/'baseline-verification.json')['base_commit'],'origin/nightly'],cwd=ROOT,check=True)
for p in r(D.parent/'reference-receipts.json'):assert h(DATA/'reference-full'/f"{p['name']}.geojson")==p['sha256']
for p in r(D/'join-provenance.json')['rasters']:assert h(Path(p['path']))==p['sha256']
for p in r(D/'search-provenance.json')['files']:assert h(Path(p['path']))==p['sha256']
for meta in sorted(D.rglob('frames.json')):
 for fr in r(meta):
  if 'point_record' in fr:
   p=next(p for p in r(ROOT/'reports/fletcher'/fr['point_record'])['points'] if p['id']==fr['point_id']);assert fr['rotation_degrees']==0 and p['pixel_xy']==fr['native_coordinates'] and p['lonlat']==fr['modern_lonlat']
  p=meta.parent/fr['image'];figures.append({'path':str(p.relative_to(ROOT)),'sha256':h(p)})
receipt={'passed':True,'rounds':rounds,'old_controls_unchanged_between_rounds':True,'promotions_preserve_coordinates_and_prior_results':True,'figure_count':len(figures),'figures':figures,'scope':'Provenance, coverage and parser/browser verification. Both rounds fail geographic acceptance.'}
(D/'packet-verification.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k not in ['figures','rounds']},indent=2))
