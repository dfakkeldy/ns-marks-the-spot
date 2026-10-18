"""Verify frozen refinement provenance, roles, preserved controls and external artifacts.
Run after render, CSV export and browser verification. Does not accept geography.
"""
from pathlib import Path
import json,hashlib,csv,subprocess
D=Path(__file__).resolve().parent;ROOT=D.parents[3];DATA=Path.home()/'Downloads/fletcher-sheet13'
read=lambda p:json.loads(p.read_text())
h=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
old=read(D.parent/'regional-fit.json');six=read(D/'repaired-fit.json');final=read(D/'final-fit.json')
assert six['points'][:11]==old['points'] and final['points'][:13]==six['points']
assert len(final['points'])==14
for ff,freeze in [('repaired-fit.json','repair-freeze.json'),('final-fit.json','final-freeze.json')]:assert h(D/ff)==read(D/freeze)['fit_sha256']
assert read(D/'repair-freeze.json')['at_utc'] < read(D/'validation.json')['collected_at_utc']
assert read(D/'final-freeze.json')['at_utc'] < read(D/'final-validation.json')['collected_at_utc']
assert h(DATA/'native/sheet13.png')==final['source_sha256']
assert h(D.parent/'boundary.json')==read(D/'final-freeze.json')['boundary_sha256']
for fit,checks,scores in [('repaired-fit.json','validation.json','validation-scores.json'),('final-fit.json','final-validation.json','final-validation-scores.json'),('final-fit.json','final-diagnostic.json','final-raster-receipt.json')]:
 f=read(D/fit);c=read(D/checks);s=read(D/scores);assert h(D/fit)==c['fit_sha256']==s['fit_sha256'];assert h(D/checks)==s['checks_sha256']
 for key in ['pixel_xy','lonlat']:assert not {tuple(p[key]) for p in f['points']} & {tuple(p[key]) for p in c['points']}
for id in ['C13','C14','C15']:
 p=next(p for p in final['points'] if p['id']==id);oldp=p['promotion'].get('old_check_record',p['promotion'].get('old_point'));assert p['pixel_xy']==oldp['pixel_xy'] and p['lonlat']==oldp['lonlat']
for prefix,fit,diag,val in [('thirteen-',six,read(D/'reused-checks.json'),read(D/'validation.json')),('',final,read(D/'final-diagnostic.json'),read(D/'final-validation.json'))]:
 for kind,extra in [('controls',[]),('diagnostic-review',diag['points']),('validation-review',val['points'])]:
  rows=list(csv.DictReader((D/f'{prefix}sheet-13-{kind}.csv').open()));points=fit['points']+extra;assert len(rows)==len(points)
  for r,p in zip(rows,points):assert [float(r['pixel_x']),float(r['pixel_y'])]==p['pixel_xy'] and [float(r['lon']),float(r['lat'])]==p['lonlat'] and r['role']==p['role'] and r['label']==p['id']
for r in read(D.parent/'reference-receipts.json'):assert h(DATA/'reference-full'/f"{r['name']}.geojson")==r['sha256']
for r in read(D/'baseline-verification.json')['files']:assert h(Path(r['path']))==r['sha256']
for r in read(D.parent/'join-provenance.json')['rasters']:assert h(Path(r['path']))==r['sha256']
assert h(Path.home()/'Downloads/fletcher-sheet12/refinement-20260912/17-control/sheet-12-full-sheet.tif')=='48e70f98e72ad23fafb00c5437e476ad693727e09a46d1ae1a3145907550a40d'
subprocess.run(['git','merge-base','--is-ancestor',read(D/'baseline-verification.json')['base_commit'],'origin/nightly'],cwd=ROOT,check=True)
search=read(D/'search-provenance.json');assert h(Path(search['node_path']))==search['sha256']
figures=[]
for meta in sorted(D.glob('*/frames.json')):
 for frame in read(meta):
  if 'point_record' in frame:
   points=read(ROOT/'reports/fletcher'/frame['point_record'])['points'];p=next(p for p in points if p['id']==frame['point_id']);assert p['pixel_xy']==frame['native_coordinates'] and p['lonlat']==frame['modern_lonlat'];assert frame['rotation_degrees']==0
  f=meta.parent/frame['image'];figures.append({'path':str(f.relative_to(ROOT)),'sha256':h(f)})
artifacts=[]
for stage in ['', '14-control/']:
 r=read(DATA/f'refinement-20260912/{stage}scores.json');assert h(Path(r['raster']['path']))==r['raster']['sha256'];artifacts.append(r)
 for name in ['import-desktop.png','reload-desktop.png','reload-mobile.png']:
  p=DATA/f'refinement-20260912/{stage}browser/{name}';figures.append({'path':str(p),'sha256':h(p)})
 proof=read(DATA/f'refinement-20260912/{stage}browser/verification.json');assert proof['before']['storedRasterSha256']==proof['after']['storedRasterSha256']==r['raster']['sha256'];assert proof['enabledStateSurvived'];assert proof['after']['transparentPixels']>0 and proof['after']['opaquePixels']>0;assert read(DATA/f'refinement-20260912/{stage}browser/errors.json')==[]
mobile=read(DATA/'refinement-20260912/14-control/browser/mobile-verification.json');assert mobile['storedRasterSha256']==artifacts[-1]['raster']['sha256'] and mobile['record']==proof['after']['record']
for name,artifact in zip(['coverage.json','final-coverage.json'],artifacts):
 coverage=read(D/name);assert coverage['passed'] and coverage['transparent_interior_cells']==0 and coverage['raster_sha256']==artifact['raster']['sha256']
assert read(D/'import-verification.json')['controls']==14
receipt={'passed':True,'final_controls':14,'fresh_checks':3,'reused_checks':8,'source_sha256':final['source_sha256'],'final_fit_sha256':h(D/'final-fit.json'),'complete_boundary_sha256':h(D.parent/'boundary.json'),'previous_eleven_controls_unchanged':True,'promotions_preserve_old_pixels_coordinates_and_scores':True,'figure_count':len(figures),'figures':figures,'raster_experiments':artifacts,'scope':'Provenance, computational and rendering verification. Geographic acceptance remains false.'}
(D/'packet-verification.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k not in ['figures','raster_experiments']},indent=2))
