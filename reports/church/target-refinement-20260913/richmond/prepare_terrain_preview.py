"""Prepare ignored local assets from the frozen GeoTIFFs; no publishing.

PYTHONPATH=. /opt/local/bin/python3.12 reports/church/target-refinement-20260913/richmond/prepare_terrain_preview.py
Then run the existing Vite server in web/ and open /__church_review_assets/.
"""
import hashlib
import json
from pathlib import Path
import shutil
from osgeo import gdal
from tools.church.geometry import mercator_to_lonlat

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
config = json.loads((HERE/'terrain-preview-inputs.json').read_text())
out = ROOT/'web/public/__church_review_assets'
out.mkdir(exist_ok=True)
(out/'.gitignore').write_text('*\n')
for entry in config['rasters']:
    source = Path(entry['raster'])
    assert hashlib.sha256(source.read_bytes()).hexdigest() == entry['raster_sha256']
    ds = gdal.Open(str(source))
    assert [ds.RasterXSize, ds.RasterYSize] == entry['size']
    gt = ds.GetGeoTransform()
    assert gt[2] == gt[4] == 0
    w,h = entry['size']
    corners = [mercator_to_lonlat(gt[0]+x*gt[1], gt[3]+y*gt[5]) for x,y in [(0,0),(w,0),(w,h),(0,h)]]
    for actual, expected in zip(corners,entry['coordinates']):
        assert all(abs(a-e)<1e-10 for a,e in zip(actual,expected))
    gdal.Translate(str(out/(entry['id']+'.png')),ds,format='PNG')
water = Path('/Users/dfakkeldy/Downloads/church-refinement-04/review-water-lines.geojson')
assert hashlib.sha256(water.read_bytes()).hexdigest() == config['water_sha256']
shutil.copyfile(water,out/'water.geojson')
shutil.copyfile(HERE/'terrain-preview.html',out/'index.html')
(out/'config.json').write_text(json.dumps(config,indent=2)+'\n')
print(out)
