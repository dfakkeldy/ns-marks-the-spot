"""Prepare ignored, local-only raster/terrain comparison assets."""
import hashlib
import json
from pathlib import Path
import shutil
from osgeo import gdal
from tools.church.geometry import mercator_to_lonlat

gdal.UseExceptions()
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
config=json.loads((HERE/'terrain-preview-inputs.json').read_text())
out=ROOT/'web/public/__church_coverage_assets'
out.mkdir(exist_ok=True)
(out/'.gitignore').write_text('*\n')
for entry in config['rasters']:
    source=Path(entry['raster'])
    assert hashlib.sha256(source.read_bytes()).hexdigest()==entry['raster_sha256']
    ds=gdal.Open(str(source))
    assert [ds.RasterXSize,ds.RasterYSize]==entry['size']
    gt=ds.GetGeoTransform()
    assert gt[2]==gt[4]==0
    w,h=entry['size']
    corners=[mercator_to_lonlat(gt[0]+x*gt[1],gt[3]+y*gt[5]) for x,y in [(0,0),(w,0),(w,h),(0,h)]]
    for actual,expected in zip(corners,entry['coordinates']):
        assert all(abs(a-e)<1e-10 for a,e in zip(actual,expected))
    gdal.Translate(str(out/(entry['id']+'.png')),ds,format='PNG')
features={}
for reference in config['water_inputs']:
    path=Path(reference['path'])
    assert hashlib.sha256(path.read_bytes()).hexdigest()==reference['sha256']
    for f in json.loads(path.read_text())['features']:
        if f['id'] in features:
            assert features[f['id']]['geometry']==f['geometry']
        features[f['id']]=f
(out/'water.geojson').write_text(json.dumps(dict(type='FeatureCollection',features=list(features.values()))))
shutil.copyfile(HERE/'terrain-preview.html',out/'index.html')
(out/'config.json').write_text(json.dumps(config,indent=2)+'\n')
print(out, len(features), 'original reference features')
