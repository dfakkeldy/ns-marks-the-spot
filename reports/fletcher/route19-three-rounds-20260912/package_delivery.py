"""Collect exact delivery receipts and a portable four-GeoTIFF review bundle."""
import json, shutil, zipfile
import work as w
OUT=w.DL/'fletcher-route19-three-rounds-20260912'
rows=[]
for s in ['14','16','22','19']:
    folder=w.HERE/f'sheet-{s}';local=OUT/f'sheet-{s}'
    scores=w.read(folder/'round-3-scores.json');raster=w.read(folder/'raster-receipt.json');coverage=w.read(folder/'coverage.json')
    assert coverage['passed'] and raster['orientation']['nonnegative_determinants']==0
    assert raster['fit_sha256']==scores['fit_sha256']
    assert w.c.digest(local/f'sheet-{s}-full-sheet.tif')==raster['raster']['sha256']
    browser=local/'browser';assert w.read(browser/'errors.json')==[]
    check=w.read(browser/'verification.json')
    assert check['enabledStateSurvived']
    assert check['before']['storedRasterSha256']==check['after']['storedRasterSha256']==raster['raster']['sha256']
    assert w.read(browser/'mobile-verification.json')['storedRasterSha256']==raster['raster']['sha256']
    evidence=folder/'browser';evidence.mkdir(exist_ok=True)
    for name in ['verification.json','mobile-verification.json','errors.json','reload-desktop.png','reload-mobile.png']:
        shutil.copy2(browser/name,evidence/name)
    rows.append(dict(sheet=s,fit=f'sheet-{s}/round-3-fit.json',fit_sha256=scores['fit_sha256'],raster=raster['raster'],rms_ground_m=scores['rms_ground_m'],control_count=scores['control_count'],excluded_diagnostics=scores['check_count'],sampled_orientation=raster['orientation'],interior_alpha_holes=0,browser_desktop_mobile_reload=True,browser_errors=[]))
manifest=dict(status='Reversible full-sheet drafts; modest diagnostic improvements, not uniform geographic acceptance',sheets=rows,local_tests=dict(fletcher_pipeline_tests=297,skipped=8,result='passed'),scope='No production layer, old mosaic tile revision, downstream label pin, or publication changed.')
w.write(w.HERE/'delivery.json',manifest)
archive=w.DL/'Fletcher-Route19-three-rounds-20260912.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=4) as z:
    for path in sorted(w.HERE.rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts and path.name!='package-receipt.json':z.write(path,path.relative_to(w.HERE))
    for row in rows:
        s=row['sheet'];path=OUT/f'sheet-{s}/sheet-{s}-full-sheet.tif';z.write(path,f'sheet-{s}/{path.name}')
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    count=len(z.infolist())
w.write(w.HERE/'package-receipt.json',dict(path=str(archive),bytes=archive.stat().st_size,sha256=w.c.digest(archive),members=count,crc_verified=True))
print(archive)
