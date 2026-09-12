"""Replay the existing GDAL pipeline over all three reviewed Sheet20 components."""
import importlib.util
import json
from pathlib import Path
import numpy as np
from matplotlib.path import Path as Polygon

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('pipeline', HERE.parent.parent / 'full-sheets/render.py')
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
c = pipeline.c
out = Path.home() / 'Downloads/fletcher-sheet20/refinement-20260912'
out.mkdir(parents=True, exist_ok=True)
source = out.parent / 'native/sheet20.png'
fit_path = HERE / 'reviewed-fit.json'
fit = json.loads(fit_path.read_text())
c.verified(source, fit['source_sha256'])
controls = [p for p in fit['points'] if p['role'] == 'control']
gcps = []
for p, world in zip(controls, c.merc([p['lonlat'] for p in controls])):
    gcps.extend(['-gcp', *map(str, [*p['pixel_xy'], *world])])
def transform(points):
    result = c.run('gdaltransform', '-tps', *gcps, stdin=''.join(f'{x} {y}\n' for x, y in points))
    return np.array([list(map(float, row.split()[:2])) for row in result.splitlines()])
features, orientation, boundaries = [], [], []
for component in ['main', 'southwest-islet', 'southeast-islet']:
    path = HERE.parent / f'boundary-{component}.json'
    boundary = json.loads(path.read_text())
    assert boundary['source_sha256'] == fit['source_sha256']
    ring = np.array(boundary['ring_pixel_xy'])
    xx, yy = np.meshgrid(np.arange(ring[:, 0].min(), ring[:, 0].max(), 25), np.arange(ring[:, 1].min(), ring[:, 1].max(), 25))
    samples = np.c_[xx.ravel(), yy.ravel()]
    samples = samples[Polygon(ring).contains_points(samples)]
    a, b, d = np.split(transform(np.vstack([samples, samples + [1, 0], samples + [0, 1]])), 3)
    dx, dy = b-a, d-a
    det = dx[:, 0]*dy[:, 1]-dx[:, 1]*dy[:, 0]
    assert (det < 0).all(), 'Orientation failure'
    orientation.append(dict(component=component, samples=len(samples), native_grid_step_px=25, nonnegative_determinants=int((det >= 0).sum()), determinant_range=[float(det.min()), float(det.max())]))
    boundaries.append(dict(component=component, path=str(path), sha256=c.digest(path)))
    features.append(dict(type='Feature', properties=dict(component=component), geometry=dict(type='Polygon', coordinates=[transform(c.dense_ring(ring)).tolist()])))
cutline = out / 'cutline.geojson'
c.write(cutline, dict(type='FeatureCollection', crs=dict(type='name', properties=dict(name='EPSG:3857')), features=features))
vrt = out / 'controls.vrt'
c.run('gdal_translate', '-of', 'VRT', '-a_srs', 'EPSG:3857', *gcps, source, vrt)
tif = out / 'sheet-20-full-sheet.tif'
command = ['gdalwarp', '-overwrite', '-tps', '-et', '0', '-t_srs', 'EPSG:3857', '-r', 'cubic', '-tr', '5', '5', '-tap', '-cutline', str(cutline), '-crop_to_cutline', '-dstalpha', '-co', 'COMPRESS=DEFLATE', '-co', 'TILED=YES', str(vrt), str(tif)]
c.run(*command)
info = json.loads(c.run('gdalinfo', '-json', tif))
assert len(info['bands']) == 4 and info['bands'][3]['colorInterpretation'] == 'Alpha'
assert info['geoTransform'][1:3] == [5, 0] and info['geoTransform'][4:] == [0, -5]
c.write(HERE / 'raster-receipt.json', dict(source_sha256=c.digest(source), fit_sha256=c.digest(fit_path), script_sha256=c.digest(Path(__file__)), boundaries=boundaries, cutline_sha256=c.digest(cutline), orientation=orientation, command=command, raster=dict(path=str(tif), sha256=c.digest(tif), size=info['size'], bounds=info['wgs84Extent']), geographic_status='Provisional research warp. Full mainland extension and both southern offshore islets retained; numerical and visual acceptance recorded separately.'))
print(tif)
