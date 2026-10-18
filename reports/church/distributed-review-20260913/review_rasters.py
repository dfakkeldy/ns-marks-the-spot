"""Inspect unchanged review rasters with directly projected original NSTDB lines.

Run from the repository root with the GIS Python. Large rasters and temporary
PNG windows remain in Downloads. This reuses the previous Church window-review
recipe; it does not generate a new warp or evaluate the browser's source mesh.
"""
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from osgeo import gdal
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
CACHE = Path('/Users/dfakkeldy/Downloads/church-distributed-20260913')


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def merc(lon, lat):
    return (6378137 * math.radians(lon),
            6378137 * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


def main():
    gdal.UseExceptions()
    jobs = json.loads((HERE / 'raster-review-inputs.json').read_text())
    receipts = []
    for job in jobs:
        raster = Path(job['raster'])
        assert digest(raster) == job['sha256'], raster
        src = gdal.Open(str(raster))
        features = {}
        for reference in job['references']:
            path = Path(reference['path'])
            assert digest(path) == reference['sha256'], path
            for feature in json.loads(path.read_text())['features']:
                features[feature['id']] = feature
        rings = []
        for f in features.values():
            g = f['geometry']
            parts = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
            rings.extend(np.array([merc(*v[:2]) for v in ring]) for ring in parts)
        out = HERE / job['panel'] / 'warped-review'
        out.mkdir(exist_ok=True)
        for name, bounds in job['regions'].items():
            w, s, e, n = bounds
            x0, y0 = merc(w, s)
            x1, y1 = merc(e, n)
            png = CACHE / (name + '-actual-raster.png')
            ds = gdal.Translate(str(png), src, projWin=[x0, y1, x1, y0],
                                width=1000, height=0, format='PNG')
            gt = ds.GetGeoTransform()
            size = [ds.RasterXSize, ds.RasterYSize]
            ds = None
            with Image.open(png) as image:
                rgba = image.convert('RGBA')
            base = Image.new('RGBA', rgba.size, '#f2f2f2')
            base.alpha_composite(rgba)
            left = base.convert('RGB')
            right = left.copy()
            draw = ImageDraw.Draw(right)
            for ring in rings:
                if (ring[:, 0].max() < x0 or ring[:, 0].min() > x1 or
                        ring[:, 1].max() < y0 or ring[:, 1].min() > y1):
                    continue
                px = np.c_[(ring[:, 0] - gt[0]) / gt[1],
                           (ring[:, 1] - gt[3]) / gt[5]]
                draw.line([tuple(v) for v in px], fill='#0094cf', width=2)
            pair = Image.new('RGB', (left.width * 2, left.height + 35), 'white')
            pair.paste(left, (0, 35))
            pair.paste(right, (left.width, 35))
            draw = ImageDraw.Draw(pair)
            draw.text((12, 10), name + ': unchanged actual review raster', fill='black')
            draw.text((left.width + 12, 10), 'Same raster + original NSTDB water lines', fill='black')
            jpg = out / (name + '.jpg')
            pair.save(jpg, quality=90)
            receipts.append(dict(panel=job['panel'], name=name,
                                 lonlat_bounds=bounds, raster=str(raster),
                                 raster_sha256=job['sha256'], geotransform=gt,
                                 window_size=size, figure=str(jpg.relative_to(HERE)),
                                 figure_sha256=digest(jpg),
                                 method='Actual raster window; vectors directly projected to EPSG:3857. No search-guide warp.'))
    (HERE / 'raster-review-receipt.json').write_text(json.dumps(dict(
        windows=receipts, new_warp=False,
        scope='Local windows and unchanged raster identities; previous full-content alpha/distortion/browser receipts remain historical evidence.'), indent=2) + '\n')
    print(f'Created {len(receipts)} actual-raster comparison windows; both raster hashes unchanged.')


if __name__ == '__main__':
    main()
