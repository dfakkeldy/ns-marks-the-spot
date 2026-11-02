#!/usr/bin/env python3
"""Place the mountain marks of the Hand-drawn Atlas style on real high ground.

Old charts drew uplands as rows of little mountains. This script decides where
those marks go from NRCan's Medium Resolution DEM (MRDEM-30, read remotely as a
cloud-optimized GeoTIFF) rather than from gazetteer points: ground counts as
upland where it stands at least RELIEF metres above the lowest ground within a
few kilometres and is itself at least FLOOR metres high. That catches the
Cape Breton and Mabou Highlands, the Creignish Hills behind Judique (which rise
from about 50 m to 200 m within a kilometre of the shore and run to Glendale)
and the Cobequids, while leaving the rolling interior plains bare.

Marks sit on a jittered grid about SPACING metres apart; each carries its
elevation, so the map can place the highest first when marks collide at small
scales, and a variant so neighbouring marks are not identical.

    /opt/local/bin/python3.12 scripts/buildHandDrawnRelief.py [--cache DIR]

Requires GDAL Python bindings, numpy, scipy and pyproj. Writes
public/atlas/relief/mountains.geojson and source.json beside it.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from osgeo import gdal
from pyproj import Transformer
from scipy.ndimage import gaussian_filter, minimum_filter

gdal.UseExceptions()

DEM_URL = 'https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif'
DEM_PAGE = 'https://open.canada.ca/data/en/dataset/18752265-bda3-498c-a4ba-9dfe68cb98da'
LICENCE_URL = 'https://open.canada.ca/en/open-government-licence-canada'
# Nova Scotia and its neighbouring shores, in Web Mercator metres.
EXTENT = (-7400000, 5310000, -6620000, 5960000)
CELL = 120          # metres of Web Mercator; about 85 m on the ground at 45 degrees N
SMOOTH = 1.5        # Gaussian sigma in cells, so marks follow landforms, not noise
WINDOW = 81         # cells across the neighbourhood whose lowest ground sets local relief (~4.7 km)
RELIEF = 100        # metres above that lowest ground
FLOOR = 120         # metres above sea level
SPACING = 1000      # ground metres between marks before jitter
VARIANTS = 3


def load_dem(cache: Path) -> tuple[np.ndarray, tuple]:
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f'mrdem30-ns-{CELL}m.tif'
    if not path.exists():
        gdal.Warp(str(path), f'/vsicurl/{DEM_URL}', dstSRS='EPSG:3857', outputBounds=EXTENT, xRes=CELL, yRes=CELL,
                  resampleAlg='average', creationOptions=['COMPRESS=DEFLATE'])
    dataset = gdal.Open(str(path))
    band = dataset.GetRasterBand(1)
    elevation = band.ReadAsArray().astype(np.float64)
    nodata = band.GetNoDataValue()
    if nodata is not None:
        elevation[elevation == nodata] = 0  # sea and gaps are never upland
    return elevation, dataset.GetGeoTransform()


def _lat(y: np.ndarray) -> np.ndarray:
    return np.degrees(2 * np.arctan(np.exp(y / 6378137.0)) - np.pi / 2)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    root = Path(__file__).resolve().parent.parent
    parser.add_argument('--cache', type=Path, default=root / 'node_modules/.cache/hand-drawn-relief')
    parser.add_argument('--out', type=Path, default=root / 'public/atlas/relief')
    options = parser.parse_args()
    elevation, (origin_x, cell_x, _, origin_y, _, cell_y) = load_dem(options.cache)
    smoothed = gaussian_filter(elevation, SMOOTH)
    upland = (smoothed >= FLOOR) & (smoothed - minimum_filter(smoothed, size=WINDOW) >= RELIEF)

    rand = np.random.default_rng(1883)
    to_lnglat = Transformer.from_crs(3857, 4326, always_xy=True)
    features = []
    y = EXTENT[1]
    while y < EXTENT[3]:
        # Ground spacing is constant, so the Web Mercator step grows with latitude.
        step = SPACING / np.cos(np.radians(_lat(np.array(y))))
        row_shift = rand.random() * step
        for x in np.arange(EXTENT[0] + row_shift, EXTENT[2], step):
            px = x + (rand.random() - 0.5) * step * 0.7
            py = y + (rand.random() - 0.5) * step * 0.7
            row, col = int((py - origin_y) / cell_y), int((px - origin_x) / cell_x)
            if not (0 <= row < upland.shape[0] and 0 <= col < upland.shape[1]) or not upland[row, col]:
                continue
            lng, lat = to_lnglat.transform(px, py)
            features.append({'type': 'Feature',
                             'properties': {'elevation': int(round(smoothed[row, col], -1)), 'variant': int(rand.integers(VARIANTS))},
                             'geometry': {'type': 'Point', 'coordinates': [round(lng, 5), round(lat, 5)]}})
        y += step
    options.out.mkdir(parents=True, exist_ok=True)
    body = json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':')) + '\n'
    (options.out / 'mountains.geojson').write_text(body)
    receipt = {
        'generator': 'scripts/buildHandDrawnRelief.py',
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'source': {'name': 'Medium Resolution Digital Elevation Model (MRDEM) 30 m, DTM', 'url': DEM_URL, 'page': DEM_PAGE,
                   'publisher': 'Natural Resources Canada'},
        'licence': {'name': 'Open Government Licence - Canada', 'url': LICENCE_URL},
        'attribution': 'Contains information licensed under the Open Government Licence - Canada (NRCan MRDEM).',
        'method': f'Resampled to {CELL} m Web Mercator cells (average) and Gaussian smoothed (sigma {SMOOTH} cells). Upland is '
                  f'ground at least {FLOOR} m high and {RELIEF} m above the lowest ground in a {WINDOW}-cell window. Marks sit on '
                  f'a jittered {SPACING} m grid over upland. Decorative relief, not survey data.',
        'features': len(features),
        'sha256': hashlib.sha256(body.encode()).hexdigest(),
    }
    (options.out / 'source.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(f'{len(features)} mountain marks, {len(body) / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
