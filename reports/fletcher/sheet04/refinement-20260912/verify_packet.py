"""Verify both Sheet 4 experiments and preserved evidence, not geographic acceptance."""
from pathlib import Path
import json,hashlib,csv,subprocess,math
D=Path(__file__).resolve().parent;ROOT=D.parents[3];DATA=Path.home()/'Downloads/fletcher-sheet04';EXT=DATA/'refinement-20260912'
r=lambda p:json.loads(p.read_text());h=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
prior=r(D.parent/'final-fit.json');ten=r(D/'repaired-fit.json');eleven=r(D/'11-control/repaired-fit.json')
assert ten['points'][:8]==prior['points'] and len(ten['points'])==10
assert eleven['points'][:10]==ten['points'] and len(eleven['points'])==11
for fit,oldchecks,oldscores,count in [(ten,D.parent/'validation.json',D.parent/'validation-scores.json',8),(eleven,D/'validation.json',D/'validation-scores.json',10)]:
 for p in fit['points'][count:]:
  old=p['promotion']['old_point'];assert old==next(q for q in r(oldchecks)['points'] if q['id']==old['id'])
  assert p['promotion']['old_result']==next(q for q in r(oldscores)['points'] if q['id']==old['id'])
  for k in ['pixel_xy','lonlat']:assert p[k]==old[k]
figures=[];experiments=[]
for P,X,expected in [(D,EXT,(10,3,3)),(D/'11-control',EXT/'11-control',(11,5,2))]:
 f=r(P/'repaired-fit.json');v=r(P/'validation.json');diag=r(P/'reused-checks.json');freeze=r(P/'repair-freeze.json')
 assert h(P/'repaired-fit.json')==freeze['fit_sha256']==v['fit_sha256']==diag['fit_sha256']
 assert freeze['at_utc']<v['collected_at_utc']<v['review_completed_at_utc']
 assert h(DATA/'native/sheet04.png')==f['source_sha256']==freeze['source_sha256']
 assert (f['source_width'],f['source_height'])==(10629,7603)
 assert h(D.parent/'boundary.json')==freeze['boundary_sha256']
 for key in ['pixel_xy','lonlat']:
  assert not {tuple(p[key]) for p in f['points']} & {tuple(p[key]) for p in v['points']+diag['points']}
 for fit,checks,scores in [(P/'repaired-fit.json',P/'validation.json',P/'validation-scores.json'),(P/'repaired-fit.json',P/'reused-checks.json',P/'raster-receipt.json')]:
  s=r(scores);assert h(fit)==s['fit_sha256'] and h(checks)==s['checks_sha256']
 for kind,extra in [('controls',[]),('diagnostic-review',diag['points']),('validation-review',v['points'])]:
  rows=list(csv.DictReader((P/f'sheet-04-{kind}.csv').open()));assert len(rows)==len(f['points'])+len(extra)
  for row,p in zip(rows,f['points']+extra):assert [float(row['pixel_x']),float(row['pixel_y'])]==p['pixel_xy'] and [float(row['lon']),float(row['lat'])]==p['lonlat'] and row['role']==p['role'] and row['label']==p['id']
 for meta in sorted(P.glob('*/frames.json')):
  for fr in r(meta):
   if 'point_record' in fr:
    p=next(p for p in r(ROOT/'reports/fletcher'/fr['point_record'])['points'] if p['id']==fr['point_id']);assert fr['rotation_degrees']==0 and p['pixel_xy']==fr['native_coordinates'] and p['lonlat']==fr['modern_lonlat']
   p=meta.parent/fr['image'];figures.append({'path':str(p.relative_to(ROOT)),'sha256':h(p)})
 artifact=r(P/'raster-receipt.json')['raster'];assert h(Path(artifact['path']))==artifact['sha256']
 coverage=r(P/'coverage.json');assert coverage['raster_sha256']==artifact['sha256'] and coverage['passed'] and coverage['transparent_interior_cells']==0
 assert r(P/'raster-receipt.json')['orientation']['nonnegative_determinants']==0
 proof=r(P/'browser/verification.json');mobile=r(P/'browser/mobile-verification.json')
 assert proof['before']==proof['after'] and proof['enabledStateSurvived']
 for record in [proof['before'],mobile]:assert record['storedRasterSha256']==artifact['sha256'] and record['transparentPixels']>0 and record['opaquePixels']>0 and [record['record']['pixelSize']['width'],record['record']['pixelSize']['height']]==artifact['size']
 assert r(P/'browser/errors.json')==[]
 for p in sorted(P.glob('browser/*.png')):figures.append({'path':str(p.relative_to(ROOT)),'sha256':h(p)})
 i=r(P/'import-verification.json');assert (i['controls'],i['checks'],i['validation_checks'])==expected and i['semantic_csv_roundtrip'] and i['maximum_web_gdal_difference_projected_m']<.001
 rp=r(P/'render-provenance.json');assert h(ROOT/rp['script'])==rp['script_sha256'] and h(X/'neatline.geojson')==rp['cutline_sha256']==coverage['cutline_sha256']
 assert r(P/'acceptance.json')['geographic_acceptance'] is False and r(P/'acceptance.json')['recommended_replacement'] is False
 experiments.append({'directory':str(P.relative_to(D)),'counts':expected,'raster':artifact})
for fit,checks,scores in [(D.parent/'final-fit.json',D/'baseline-validation.json',D/'baseline-validation-scores.json'),(D.parent/'final-fit.json',D/'11-control/baseline-eight-validation.json',D/'11-control/baseline-eight-validation-scores.json'),(D/'repaired-fit.json',D/'11-control/baseline-ten-validation.json',D/'11-control/baseline-ten-validation-scores.json')]:
 assert h(fit)==r(scores)['fit_sha256'] and h(checks)==r(scores)['checks_sha256']
# Fresh means absent from historical controls, checks and rejected point identities.
history=[]
def walk(x):
 if isinstance(x,dict):
  if 'pixel_xy' in x and 'lonlat' in x:history.append(x)
  for v in x.values():walk(v)
 elif isinstance(x,list):
  for v in x:walk(v)
for p in D.parent.glob('*.json'):walk(r(p))
for P in [D,D/'11-control']:
 for p in r(P/'validation.json')['points']:
  for q in history:
   assert p.get('modern_node_id')!=q.get('modern_node_id') or not p.get('modern_node_id')
   dist=111195*math.hypot((p['lonlat'][0]-q['lonlat'][0])*math.cos(math.radians(p['lonlat'][1])),p['lonlat'][1]-q['lonlat'][1]);assert dist>2
 if P==D:
  for name in ['validation.json','repaired-fit.json','repair-proposals.json']:walk(r(D/name))
baseline=r(D/'baseline-verification.json')
for p in baseline['files']:assert h(Path(p['path']))==p['sha256']
subprocess.run(['git','merge-base','--is-ancestor',baseline['base_commit'],'origin/nightly'],cwd=ROOT,check=True)
for name in ['final-fit.json','boundary.json']:
 raw=subprocess.check_output(['git','show',baseline['base_commit']+':reports/fletcher/sheet04/'+name],cwd=ROOT);assert hashlib.sha256(raw).hexdigest()==h(D.parent/name)
for p in r(D.parent/'reference-receipts.json'):assert h(DATA/'reference-full'/f"{p['name']}.geojson")==p['sha256']
for p in r(D/'join-provenance.json')['rasters']:assert h(Path(p['path']))==p['sha256']
sp=r(D/'search-provenance.json');assert h(Path(sp['path']))==sp['sha256'] and h(ROOT/sp['guide']['path'])==sp['guide']['sha256']
assert len(figures)==60
receipt={'passed':True,'experiments':experiments,'figure_count':len(figures),'figures':figures,'scope':'Provenance, independent record identities, coverage and browser/CSV import only. Both experiments fail geographic acceptance and are not recommended replacements.'}
(D/'packet-verification.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'passed':True,'figure_count':len(figures),'experiments':[x['counts'] for x in experiments]}))
