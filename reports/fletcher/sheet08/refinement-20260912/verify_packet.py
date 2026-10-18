"""Verify this failed experiment's provenance and import evidence; not geography."""
from pathlib import Path
import json,hashlib,csv,subprocess
D=Path(__file__).resolve().parent;ROOT=D.parents[3];DATA=Path.home()/'Downloads/fletcher-sheet08';EXT=DATA/'refinement-20260912'
r=lambda p:json.loads(p.read_text());h=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
f=r(D/'repaired-fit.json');v=r(D/'validation.json');diag=r(D/'reused-checks.json');freeze=r(D/'repair-freeze.json')
assert f['points'][:10]==r(D.parent/'repaired-fit.json')['points'] and len(f['points'])==11
assert h(D/'repaired-fit.json')==freeze['fit_sha256']==v['fit_sha256']==diag['fit_sha256']
assert freeze['at_utc']<v['collected_at_utc']<v['review_completed_at_utc']
assert h(DATA/'native/sheet08.png')==f['source_sha256']==freeze['source_sha256']
assert h(D.parent/'boundary.json')==freeze['boundary_sha256']
p=f['points'][-1];assert p['id']=='C13'
assert p['reviewed_proposal']==r(D/'repair-corrected.json')['points'][0]
for key in ['pixel_xy','lonlat']:
 assert p[key]==p['reviewed_proposal'][key]
 assert not {tuple(p[key]) for p in f['points']} & {tuple(p[key]) for p in v['points']+diag['points']}
for fit,checks,scores in [(D/'repaired-fit.json',D/'validation.json',D/'validation-scores.json'),(D/'repaired-fit.json',D/'reused-checks.json',D/'raster-receipt.json'),(D.parent/'repaired-fit.json',D/'baseline-validation.json',D/'baseline-validation-scores.json')]:
 s=r(scores);assert h(fit)==s['fit_sha256'] and h(checks)==s['checks_sha256']
for kind,extra in [('controls',[]),('diagnostic-review',diag['points']),('validation-review',v['points'])]:
 rows=list(csv.DictReader((D/f'sheet-08-{kind}.csv').open()));assert len(rows)==len(f['points'])+len(extra)
 for row,p in zip(rows,f['points']+extra):assert [float(row['pixel_x']),float(row['pixel_y'])]==p['pixel_xy'] and [float(row['lon']),float(row['lat'])]==p['lonlat'] and row['role']==p['role'] and row['label']==p['id']
for p in r(D/'baseline-verification.json')['files']:assert h(Path(p['path']))==p['sha256']
subprocess.run(['git','merge-base','--is-ancestor',r(D/'baseline-verification.json')['base_commit'],'origin/nightly'],cwd=ROOT,check=True)
for p in r(D.parent/'reference-receipts.json'):assert h(DATA/'reference-full'/f"{p['name']}.geojson")==p['sha256']
for p in r(D/'join-provenance.json')['rasters']:assert h(Path(p['path']))==p['sha256']
sp=r(D/'search-provenance.json');assert h(Path(sp['path']))==sp['sha256']
figures=[]
for meta in sorted(D.glob('*/frames.json')):
 for fr in r(meta):
  if 'point_record' in fr:
   p=next(p for p in r(ROOT/'reports/fletcher'/fr['point_record'])['points'] if p['id']==fr['point_id']);assert fr['rotation_degrees']==0 and p['pixel_xy']==fr['native_coordinates'] and p['lonlat']==fr['modern_lonlat']
  p=meta.parent/fr['image'];figures.append({'path':str(p.relative_to(ROOT)),'sha256':h(p)})
artifact=r(D/'raster-receipt.json')['raster'];assert h(Path(artifact['path']))==artifact['sha256']
coverage=r(D/'coverage.json');assert coverage['raster_sha256']==artifact['sha256'] and coverage['passed'] and coverage['transparent_interior_cells']==0
proof=r(EXT/'browser/verification.json');mobile=r(EXT/'browser/mobile-verification.json')
assert proof['before']==proof['after'] and proof['enabledStateSurvived']
for record in [proof['before'],mobile]:assert record['storedRasterSha256']==artifact['sha256'] and record['transparentPixels']>0 and record['opaquePixels']>0 and [record['record']['pixelSize']['width'],record['record']['pixelSize']['height']]==artifact['size']
assert r(EXT/'browser/errors.json')==[]
for name in ['import-desktop.png','reload-desktop.png','reload-mobile.png']:
 p=EXT/'browser'/name;figures.append({'path':str(p),'sha256':h(p)})
i=r(D/'import-verification.json');assert (i['controls'],i['checks'],i['validation_checks'])==(11,5,2) and i['semantic_csv_roundtrip'] and i['maximum_web_gdal_difference_projected_m']<.001
receipt={'passed':True,'controls':11,'reused_checks':5,'collected_fresh_checks':2,'old_ten_controls_unchanged':True,'new_control_matches_reviewed_corrected_proposal':True,'figure_count':len(figures),'figures':figures,'raster':artifact,'scope':'Computational, provenance and import verification only. Fresh thresholds and whole-sheet geography fail. Local Margaree improvement only; original C12 and V01 topology concerns remain.'}
(D/'packet-verification.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k not in ['figures','raster']},indent=2))
