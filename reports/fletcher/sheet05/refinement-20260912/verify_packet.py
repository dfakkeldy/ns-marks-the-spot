"""Verify preserved Sheet 5 experiment and evidence, never geographic acceptance."""
from pathlib import Path
import json,hashlib,csv,subprocess
D=Path(__file__).resolve().parent;ROOT=D.parents[3];DATA=Path.home()/'Downloads/fletcher-sheet05';EXT=DATA/'refinement-20260912'
r=lambda p:json.loads(p.read_text());h=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
f=r(D/'repaired-fit.json');v=r(D/'validation.json');diag=r(D/'reused-checks.json');freeze=r(D/'repair-freeze.json');prior=r(D.parent/'final-fit.json')
assert f['points'][:11]==prior['points'] and len(f['points'])==12
assert h(D/'repaired-fit.json')==freeze['fit_sha256']==v['fit_sha256']==diag['fit_sha256']
assert freeze['at_utc']<v['collected_at_utc']<v['review_completed_at_utc']
assert h(DATA/'native/sheet05.png')==f['source_sha256']==freeze['source_sha256']
assert h(D.parent/'boundary.json')==freeze['boundary_sha256']
p=f['points'][-1];old=next(p for p in r(D/'repair-corrected.json')['points'] if p['id']=='R01')
assert p['id']=='C12' and p['reviewed_repair_record']==old
for key in ['pixel_xy','lonlat']:
 assert p[key]==old[key]
 assert not {tuple(p[key]) for p in f['points']} & {tuple(p[key]) for p in v['points']+diag['points']}
 history=[p for name in ['final-fit.json','diagnostic.json','validation.json','rejected-diagnostics.json'] for p in r(D.parent/name)['points']]
 assert not {tuple(p[key]) for p in history} & {tuple(p[key]) for p in v['points']}
assert not {p.get('modern_node_id') for p in history} & {p['modern_node_id'] for p in v['points']}
assert [p['id'] for p in v['points']]==['F05','F07']
assert {p['id'] for p in r(D/'rejected-before-score.json')['points']}=={'F06'}
assert {p['id'] for p in r(D/'rejected-repairs.json')['points']}=={'R02'}
for fit,checks,scores in [(D/'repaired-fit.json',D/'validation.json',D/'validation-scores.json'),(D/'repaired-fit.json',D/'reused-checks.json',D/'raster-receipt.json'),(D.parent/'final-fit.json',D/'baseline-validation.json',D/'baseline-validation-scores.json')]:
 s=r(scores);assert h(fit)==s['fit_sha256'] and h(checks)==s['checks_sha256']
for kind,extra in [('controls',[]),('diagnostic-review',diag['points']),('validation-review',v['points'])]:
 rows=list(csv.DictReader((D/f'sheet-05-{kind}.csv').open()));assert len(rows)==len(f['points'])+len(extra)
 for row,p in zip(rows,f['points']+extra):assert [float(row['pixel_x']),float(row['pixel_y'])]==p['pixel_xy'] and [float(row['lon']),float(row['lat'])]==p['lonlat'] and row['role']==p['role'] and row['label']==p['id']
baseline=r(D/'baseline-verification.json')
for p in baseline['files']:assert h(Path(p['path']))==p['sha256']
subprocess.run(['git','merge-base','--is-ancestor',baseline['base_commit'],'origin/nightly'],cwd=ROOT,check=True)
for name in ['final-fit.json','boundary.json']:
 raw=subprocess.check_output(['git','show',baseline['base_commit']+':reports/fletcher/sheet05/'+name],cwd=ROOT);assert hashlib.sha256(raw).hexdigest()==h(D.parent/name)
for p in r(D.parent/'reference-receipts.json'):assert h(DATA/'reference-full'/f"{p['name']}.geojson")==p['sha256']
for p in r(D/'join-provenance.json')['rasters']:assert h(Path(p['path']))==p['sha256']
sp=r(D/'search-provenance.json');assert h(Path(sp['path']))==sp['sha256'] and h(ROOT/sp['guide']['path'])==sp['guide']['sha256']
rp=r(D/'render-provenance.json');assert h(ROOT/rp['script'])==rp['script_sha256'] and h(EXT/'neatline.geojson')==rp['cutline_sha256']
figures=[]
for meta in sorted(D.glob('*/frames.json')):
 for fr in r(meta):
  if 'point_record' in fr:
   p=next(p for p in r(ROOT/'reports/fletcher'/fr['point_record'])['points'] if p['id']==fr['point_id']);assert fr['rotation_degrees']==0 and p['pixel_xy']==fr['native_coordinates'] and p['lonlat']==fr['modern_lonlat']
  p=meta.parent/fr['image'];figures.append({'path':str(p.relative_to(ROOT)),'sha256':h(p)})
artifact=r(D/'raster-receipt.json')['raster'];assert h(Path(artifact['path']))==artifact['sha256']
coverage=r(D/'coverage.json');assert coverage['raster_sha256']==artifact['sha256'] and coverage['passed'] and coverage['transparent_interior_cells']==0
proof=r(D/'browser/verification.json');mobile=r(D/'browser/mobile-verification.json')
assert proof['before']==proof['after'] and proof['enabledStateSurvived']
for record in [proof['before'],mobile]:assert record['storedRasterSha256']==artifact['sha256'] and record['transparentPixels']>0 and record['opaquePixels']>0 and [record['record']['pixelSize']['width'],record['record']['pixelSize']['height']]==artifact['size']
assert r(D/'browser/errors.json')==[]
for p in sorted(D.glob('browser*/*.png')):figures.append({'path':str(p.relative_to(ROOT)),'sha256':h(p)})
i=r(D/'import-verification.json');assert (i['controls'],i['checks'],i['validation_checks'])==(12,6,2) and i['semantic_csv_roundtrip'] and i['maximum_web_gdal_difference_projected_m']<.001
assert r(D/'acceptance.json')['geographic_acceptance'] is False
assert len(figures)==36
receipt={'passed':True,'controls':12,'reused_checks':6,'qualified_fresh_checks':2,'old_eleven_controls_unchanged':True,'new_control_matches_reviewed_repair':True,'figure_count':len(figures),'figures':figures,'raster':artifact,'scope':'Provenance, computation, coverage and import only. Local Sunday Lake improvement; whole raster and seams remain geographically unaccepted.'}
(D/'packet-verification.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k not in ['figures','raster']},indent=2))
