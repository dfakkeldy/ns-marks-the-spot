from pathlib import Path
import json,hashlib,shutil,datetime,subprocess
from PIL import Image
D=Path('reports/fletcher/sheet10');L=Path.home()/'Downloads/fletcher-sheet10'
def write(p,d):p.write_text(json.dumps(d,indent=2)+'\n')
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
 return h.hexdigest()
s=json.loads((D/'source-receipt.json').read_text());assert digest(Path(s['source_path']))==s['source_sha256'];assert digest(L/'native/sheet10.tif')==s['tif_sha256'];assert digest(L/'native/manifest.json')==s['manifest_sha256'];assert Image.open(s['source_path']).size==tuple(s['native_dimensions'])
refs=json.loads((D/'reference-receipts.json').read_text())
for r in refs:
 p=L/'reference-full'/f"{r['name']}.geojson";assert digest(p)==r['sha256'];assert len(json.loads(p.read_text())['features'])==r['count']
f=json.loads((D/'repaired-fit.json').read_text());old=json.loads((D/'reviewed-fit.json').read_text());h=digest(D/'repaired-fit.json');assert f['points'][:10]==old['points'];assert digest(D/'reviewed-fit.json')==json.loads((D/'initial-freeze.json').read_text())['fit_sha256'];assert h==json.loads((D/'repair-freeze.json').read_text())['fit_sha256']
for qid,cid in [('Q01','C13'),('Q03','C14')]:
 p=next(p for p in json.loads((D/'diagnostic.json').read_text())['points'] if p['id']==qid);q=next(p for p in f['points'] if p['id']==cid);assert p['pixel_xy']==q['pixel_xy'] and p['lonlat']==q['lonlat']
for name in ['validation.json','repair-diagnostic.json']:
 checks=json.loads((D/name).read_text());assert checks['fit_sha256']==h
 for p in checks['points']:assert p['role']=='check' and all(p['pixel_xy']!=q['pixel_xy'] and p['lonlat']!=q['lonlat'] for q in f['points'])
for r in json.loads((D/'prior-state.json').read_text())['files']:
 p=Path(r['path']);assert digest(p)==r['sha256'];assert subprocess.check_output(['git','show','HEAD:'+str(p)])==p.read_bytes()
write(D/'preservation-verification.json',dict(verified_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),initial_ten_controls_unchanged=True,promotions=['Q01 to C13','Q03 to C14'],promotion_coordinates_unchanged=True,failed_initial_fit_and_scores_preserved=True,fresh_validation_disjoint_from_fit=True,original_two_prior_files_unchanged=True,source_sha256_verified=s['source_sha256'],reference_files_verified=len(refs),fit_sha256=h))
r=json.loads((D/'raster-receipt.json').read_text());assert digest(Path(r['raster']['path']))==r['raster']['sha256'];assert r['fit_sha256']==h;assert digest(D/'boundary.json')==r['boundary_sha256'];assert json.loads((D/'coverage.json').read_text())['passed']
write(D/'render-provenance.json',dict(source=s['source_path'],source_sha256=s['source_sha256'],source_native_dimensions=s['native_dimensions'],fit_sha256=h,boundary_sha256=r['boundary_sha256'],raster_sha256=r['raster']['sha256'],render_script='reports/fletcher/full-sheets/render.py',render_script_sha256=digest(Path('reports/fletcher/full-sheets/render.py')),method='One exact GDAL TPS (-et 0), EPSG:3857, 5 projected metre cells, complete mapped frame plus continuous northeast Bentinck and southern St Anns notches, RGBA. Reused diagnostic and fresh validation remain separate.'))
paths=[Path(r['raster']['path']),Path.home()/'Downloads/fletcher-sheet11/completion-20260911/sheet-11-exact.tif',Path.home()/'Downloads/fletcher-sheet12/regional-fourteen/sheet-12-full-sheet.tif'];write(D/'join-provenance.json',dict(rasters=[dict(path=str(p),sha256=digest(p)) for p in paths],status='Four actual western Sheet11 and southern Sheet12 comparisons personally inspected. No seam accepted. Northern Sheet8 comparison pending its physical raster.'))
b=L/'regional-twelve/browser';proof=json.loads((b/'verification.json').read_text());before,after=proof['before'],proof['after'];assert before['storedRasterSha256']==after['storedRasterSha256']==r['raster']['sha256'];assert before['record']['georef']==after['record']['georef'];assert before['record']['pixelSize']==after['record']['pixelSize'];assert before['transparentPixels']==after['transparentPixels'];errors=json.loads((b/'errors.json').read_text());assert not errors
write(D/'browser-verification.json',dict(method='Actual GeoTIFF UI import in isolated Chromium via Playwright; desktop 1440x1000 and mobile 390x844 screenshots personally inspected.',geographic_acceptance=False,url='http://127.0.0.1:4198/?basemap=osm&taxSale=off&layers=modern&position=46.36,-60.66,11',raster_sha256=before['storedRasterSha256'],raster_bytes=before['rasterBytes'],pixel_size=before['record']['pixelSize'],georef=before['record']['georef'],preview_size=before['previewSize'],transparent_preview_pixels=before['transparentPixels'],opaque_preview_pixels=before['opaquePixels'],raster_bytes_and_georef_preserved_on_reload=True,enabled_state_survived_reload=proof['enabledStateSurvived'],console_and_page_errors=errors,screenshots=[dict(path=str(b/n),sha256=digest(b/n)) for n in ['import-desktop.png','reload-desktop.png','reload-mobile.png']],full_receipt=str(b/'verification.json')))
write(D/'boundary-review-frame.json',dict(source_sha256=s['source_sha256'],native_dimensions=s['native_dimensions'],rotation_degrees=0,image='boundary-overview.jpg',extension_native_boxes=[[9480,1080,10200,2350],[6750,6320,7330,6700]],status='Full native overview, corners, coordinate labels and both extensions personally inspected. One continuous ring retains Bentinck Point and its labels to the northeast, and the southern St Anns point. Whitespace and incidental marginal text retained.'))
context=D/'matching-context';context.mkdir(exist_ok=True);frames=[]
for name,box in [('northwest',[1465,1110,4600,3900]),('northcentral',[4350,1110,7200,3900]),('northeast',[6950,1110,10190,3950]),('southwest',[1465,3700,5900,6580]),('southeast',[5700,3700,9660,6660])]:
 for kind in ['grid','modern']:shutil.copyfile(L/f'search/{name}-{kind}.jpg',context/f'{name}-{kind}.jpg')
 frames.append(dict(name=name,native_box=box,source_image=name+'-grid.jpg',modern_image=name+'-modern.jpg',rotation_degrees=0,method='Ten individually measured slanted printed-graticule intersections give search guidance only, not physical fitting controls or warped-image proof.'))
write(context/'frames.json',frames);shutil.copyfile(L/'search.py',D/'search_context.py');shutil.copyfile(L/'search/all-modern-nodes-anchored.json',context/'modern-node-index.json')
count=0
for p in D.rglob('frames.json'):
 for frame in json.loads(p.read_text()):
  if 'point_record' not in frame:continue
  pts=json.loads((Path('reports/fletcher')/frame['point_record']).read_text())['points'];q=next(q for q in pts if q['id']==frame['point_id']);assert frame['native_coordinates']==q['pixel_xy'];assert frame['modern_lonlat']==q['lonlat'];assert (p.parent/frame['image']).exists();count+=1
assert count==49
write(D/'frame-verification.json',dict(point_frames_verified=count,scope='Each figure metadata matches exact preserved-stage coordinates. All point frames personally inspected; original proposals and corrected stages remain distinct.'))
write(D/'visual-review.json',dict(personally_inspected_point_frames=count,personally_inspected_warped_frames=11,personally_inspected_adjacent_frames=4,personally_inspected_browser_screenshots=3,geographic_acceptance=False,limitations=['Three fresh checks: median 515.042393 m and worst 556.374737 m exceed 100/200 m thresholds','Sparse southeast and western interior physical support; no accepted eastern shore validation','Substantial historical/modern river and shore differences','Reused Q02 remains failed at 314.763879 m','Western and southern joins unaccepted; northern Sheet8 pending','Mapped sea and unsupported regions remain extrapolation']))
print('Verified source, TIFF, manifest, four references, two original grid files, ten preserved controls, two promotions, frozen checks, raster, coverage, browser and',count,'point frames.')
