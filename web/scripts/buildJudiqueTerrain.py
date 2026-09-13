#!/usr/bin/env python3
"""Build a bounded contour-derived Judique inspection surface, not a watershed DEM.

Requires numpy, scipy, pillow, pyproj, requests, shapely and GDAL CLI. Raw inputs are
cached outside Git. NSHN is a draped reference: its Z values are deliberately
not mixed with contour elevations whose datum/epoch may differ.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
from datetime import datetime, timezone

import numpy as np
from PIL import Image
from pyproj import Transformer
import requests
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
from scipy.ndimage import gaussian_filter, map_coordinates
from shapely import contains_xy
from shapely.geometry import box, mapping, shape
from shapely.ops import transform, unary_union

BOUNDS = [-61.60, 45.74, -61.21, 45.93]
BUFFER = [-61.65, 45.70, -61.16, 45.97]
HYDRO = 'https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_NSHN_UT83/MapServer'
CONTOURS = 'https://data.novascotia.ca/resource/bhx9-mpui.geojson'
WATER = 'https://data.novascotia.ca/resource/h8jb-hzrm.geojson'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, separators=(',', ':')) + '\n')


def fetch(url, params):
    response = requests.get(url, params=params, timeout=120)
    response.raise_for_status()
    value = response.json()
    if value.get('error') or value.get('exceededTransferLimit'):
        raise ValueError(f'Incomplete source response: {url}')
    return value


def line_parts(feature):
    geometry = feature['geometry']
    return [geometry['coordinates']] if geometry['type'] == 'LineString' else geometry['coordinates']


def cached_inputs(cache):
    contours_path = cache / 'contours.json'
    if not contours_path.exists():
        features = []
        for offset in range(0, 100000, 500):
            page = fetch(CONTOURS, {
                '$where': f"within_box(the_geom,{BUFFER[3]},{BUFFER[0]},{BUFFER[1]},{BUFFER[2]}) AND feat_desc LIKE 'CONTOUR%'",
                '$limit': 500, '$offset': offset, '$order': ':id',
            })['features']
            features.extend(page)
            print(f'Contours: {len(features)}', flush=True)
            if len(page) < 500:
                break
        else:
            raise ValueError('Contour pagination exceeded limit')
        write_json(contours_path, {'type': 'FeatureCollection', 'features': features})
    hydro_path = cache / 'hydro.json'
    if not hydro_path.exists():
        features = []
        for layer in [9, 11]:
            ids = fetch(f'{HYDRO}/{layer}/query', {
                'f': 'json', 'geometry': ','.join(map(str, BUFFER)), 'geometryType': 'esriGeometryEnvelope',
                'inSR': 4326, 'spatialRel': 'esriSpatialRelIntersects', 'returnIdsOnly': 'true',
            }).get('objectIds')
            if ids is None:
                raise ValueError('NSHN did not return an ID list')
            for start in range(0, len(ids), 100):
                batch = ids[start:start + 100]
                page = fetch(f'{HYDRO}/{layer}/query', {
                    'f': 'geojson', 'objectIds': ','.join(map(str, batch)), 'outSR': 4326,
                    'outFields': 'OBJECTID,FEAT_DESC,FLOWDIR,RIVNAME_1', 'returnZ': 'false',
                })['features']
                if len(page) != len(batch):
                    raise ValueError('NSHN feature batch incomplete')
                for feature in page:
                    feature['properties']['sourceLayer'] = layer
                features.extend(page)
            print(f'NSHN: {len(features)}', flush=True)
        write_json(hydro_path, {'type': 'FeatureCollection', 'features': features})
    water_path = cache / 'water-polygons-v2.json'
    if not water_path.exists():
        features = []
        west, south, east, north = BUFFER
        envelope = f'POLYGON (({west} {south},{east} {south},{east} {north},{west} {north},{west} {south}))'
        for offset in range(0, 100000, 500):
            page = fetch(WATER, {'$where': f"intersects(the_geom, '{envelope}')",
                                '$select': ':id AS source_row_id,the_geom,feat_desc,zvalue,feat_code,shape_area,shape_len', '$limit': 500,
                                '$offset': offset, '$order': ':id'})['features']
            features.extend(page)
            if len(page) < 500:
                break
        else:
            raise ValueError('Water polygon pagination exceeded limit')
        write_json(water_path, {'type': 'FeatureCollection', 'features': features})
    return contours_path, hydro_path, water_path


def condition_water(surface, xx, yy, water, project, interpolation):
    """Lake estimates share the contour model's unresolved datum; source Z is unused.

    Dissolve sheet seams before sampling real shorelines. Reject incomplete or
    inconsistent shoreline support. Rivers/wetlands never receive a constant Z.
    """
    lake_classes = {'Lake Water polygon', 'Reservoir Water polygon'}
    lakes, oceans = [], []
    reference = []
    for feature in water['features']:
        description = feature['properties']['feat_desc']
        if description not in lake_classes | {'Coast Water Area polygon', 'River Water Area polygon', 'Coast River Water polygon'}:
            continue
        geometry = transform(project.transform, shape(feature['geometry']))
        if not geometry.is_valid:
            raise ValueError('Invalid source water polygon; review before conditioning')
        reference.append(feature)
        if description in lake_classes:
            lakes.append((geometry, feature['properties']['source_row_id']))
        elif description == 'Coast Water Area polygon':
            oceans.append(geometry)
    ocean = unary_union(oceans)
    ocean_mask = contains_xy(ocean, xx, yy)
    surface[ocean_mask] = 0  # Display convention, not a tide/datum observation.
    lake_union = unary_union([geometry for geometry, _ in lakes])
    parts = list(lake_union.geoms) if lake_union.geom_type == 'MultiPolygon' else [lake_union]
    records = []
    grid = box(xx.min(), yy.min(), xx.max(), yy.max())
    for index, lake in enumerate(parts):
        mask = contains_xy(lake, xx, yy)
        record = {'modelId': index, 'sourceRowIds': [source_id for geometry, source_id in lakes if geometry.intersection(lake).area > 0],
                  'areaSquareMetres': lake.area, 'gridCells': int(mask.sum()), 'status': 'reference-only'}
        if not grid.contains(lake):
            record['reason'] = 'shoreline-outside-input-grid'
        elif not mask.any():
            record['reason'] = 'smaller-than-grid-sampling'
        else:
            rings = [lake.exterior, *lake.interiors]
            samples = [ring.interpolate(distance) for ring in rings
                       for distance in np.linspace(0, ring.length, max(8, math.ceil(ring.length / 30)), endpoint=False)]
            z = interpolation([point.x for point in samples], [point.y for point in samples])
            if not np.isfinite(z).all():
                record['reason'] = 'shoreline-outside-contour-hull'
            else:
                p10, p90 = np.percentile(z, [10, 90])
                record.update({'shorelineSamples': len(z), 'shorelineP10Metres': float(p10), 'shorelineP90Metres': float(p90),
                               'shorelineRangeMetres': float(np.ptp(z))})
                if p90 - p10 > 10 or np.ptp(z) > 20:
                    record['reason'] = 'inconsistent-shoreline-estimates'
                else:
                    level = float(np.median(z))
                    before = surface[mask].copy()
                    surface[mask] = level
                    record.update({'status': 'estimated-flat-lake', 'estimatedElevationMetres': level,
                                   'maxGridAdjustmentMetres': float(np.max(np.abs(before - level))),
                                   'conditionedGridRangeMetres': float(np.ptp(surface[mask]))})
        records.append(record)
    return reference, {'method': 'Dissolve touching lake/reservoir polygons; sample complete shoreline every <=30 m from unsmoothed contour triangulation; median estimated level. Require finite support, P90-P10 <=10 m and full range <=20 m. Burn constant lake cells after display smoothing; islands remain excluded.',
                       'domain': 'Buffered input grid; counts include features outside the smaller displayed Judique bounds.',
                       'resolutionCaveat': 'Flat grid interiors are resampled into RGB tiles; shore transitions and sub-grid water bodies are not exact polygon breaklines.',
                       'lakeLevelsAre': 'Model estimates in the contour source vertical frame, not surveyed water levels; spread gates are screening heuristics, not accuracy claims.',
                       'sourceWaterZUsed': False, 'ocean': {'method': 'Explicit Coast Water Area polygons set to display zero; islands excluded.', 'gridCells': int(ocean_mask.sum()), 'verticalMeaning': 'Display-zero convention only; not sea-level, tidal, or bathymetric evidence.'},
                       'rivers': 'Draped references only; no constant elevation, flow direction or drainage enforcement.',
                       'lakes': records}


def terrain_rgb(elevation):
    encoded = np.rint((elevation + 10000) * 10).astype(np.uint32)
    return np.stack([(encoded >> 16) & 255, (encoded >> 8) & 255, encoded & 255], axis=-1).astype('uint8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--historical', type=Path, required=True)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    contours_path, hydro_path, water_path = cached_inputs(args.cache)
    contours = json.loads(contours_path.read_text())
    hydro = json.loads(hydro_path.read_text())
    water = json.loads(water_path.read_text())
    project = Transformer.from_crs(4326, 32620, always_xy=True)
    unproject = Transformer.from_crs(32620, 4326, always_xy=True)
    clip = box(*BOUNDS)
    def display_geometry(feature):
        geometry = shape(feature['geometry']).intersection(clip)
        # Simplify in ground-like UTM metres, only for browser display. The
        # interpolation above continues to use original contour geometry.
        simplified = transform(unproject.transform, transform(project.transform, geometry).simplify(5))
        return json.loads(json.dumps(mapping(simplified)))
    points = []
    display = []
    for feature in contours['features']:
        z = float(feature['properties']['zvalue'])
        if not math.isfinite(z):
            raise ValueError('Invalid contour elevation')
        display_parts = []
        for part in line_parts(feature):
            coordinates = np.array(part)[:, :2]
            xy = np.column_stack(project.transform(coordinates[:, 0], coordinates[:, 1]))
            # Sample by length, not vertex count, so dense digitization does not
            # dominate the surface. Preserve endpoints and source heights.
            keep = [0]
            for index in range(1, len(xy)):
                if np.linalg.norm(xy[index] - xy[keep[-1]]) >= 40:
                    keep.append(index)
            if keep[-1] != len(xy) - 1:
                keep.append(len(xy) - 1)
            points.extend([[*xy[i], z] for i in keep])
            display_parts.append(np.round(coordinates, 6).tolist())
        display.append({'type': 'Feature', 'properties': feature['properties'],
                        'geometry': {'type': 'MultiLineString', 'coordinates': display_parts}})
    p = np.array(points)
    # Coincident samples must not feed conflicting heights into triangulation.
    unique, inverse = np.unique(np.round(p[:, :2], 2), axis=0, return_inverse=True)
    zmin = np.full(len(unique), np.inf)
    zmax = np.full(len(unique), -np.inf)
    np.minimum.at(zmin, inverse, p[:, 2])
    np.maximum.at(zmax, inverse, p[:, 2])
    if np.any(zmax - zmin > 0.1):
        raise ValueError('Conflicting contour elevations at a shared position')
    print(f'Interpolating {len(unique)} contour samples', flush=True)
    interpolation = LinearNDInterpolator(unique, zmin)
    nearest = NearestNDInterpolator(unique, zmin)
    x0, y0 = project.transform(BUFFER[0], BUFFER[1])
    x1, y1 = project.transform(BUFFER[2], BUFFER[3])
    cell = 30
    xs, ys = np.arange(x0, x1 + cell, cell), np.arange(y0, y1 + cell, cell)
    xx, yy = np.meshgrid(xs, ys)
    surface = interpolation(xx, yy)
    missing = ~np.isfinite(surface)
    surface[missing] = nearest(xx[missing], yy[missing])
    # This mild display smoothing is explicitly not drainage enforcement.
    surface = gaussian_filter(surface, sigma=1)
    water_reference, water_conditioning = condition_water(surface, xx, yy, water, project, interpolation)
    # Record support and contour agreement; this is not independent validation.
    fitted = map_coordinates(surface, [(unique[:, 1] - y0) / cell, (unique[:, 0] - x0) / cell], order=1, mode='nearest')
    inside = (unique[:, 0] >= xs[0]) & (unique[:, 0] <= xs[-1]) & (unique[:, 1] >= ys[0]) & (unique[:, 1] <= ys[-1])
    errors = fitted[inside] - zmin[inside]
    supported = [BOUNDS[0], BOUNDS[1], BOUNDS[2], BOUNDS[3]]
    # Build complete surrounding XYZ tiles so terrain borders never request a
    # missing neighbor. The receipt and map fence identify the inspection area.
    tile_count = 0
    for zoom in range(8, 13):
        n = 2 ** zoom
        def tilexy(lon, lat):
            return (lon + 180) / 360 * n, (1 - np.arcsinh(np.tan(np.deg2rad(lat))) / np.pi) / 2 * n
        west, north = tilexy(BOUNDS[0], BOUNDS[3])
        east, south = tilexy(BOUNDS[2], BOUNDS[1])
        for tx in range(math.floor(west) - 1, math.floor(east) + 2):
            for ty in range(math.floor(north) - 1, math.floor(south) + 2):
                px, py = np.meshgrid((tx + (np.arange(256) + .5) / 256) / n,
                                     (ty + (np.arange(256) + .5) / 256) / n)
                lon = px * 360 - 180
                lat = np.rad2deg(np.arctan(np.sinh(np.pi * (1 - 2 * py))))
                mx, my = project.transform(lon, lat)
                heights = map_coordinates(surface, [(my - y0) / cell, (mx - x0) / cell], order=1, mode='nearest')
                # Outside the buffered input grid is renderer padding, not a
                # claim of terrain coverage. It is outside the camera bounds.
                folder = args.output / 'dem' / str(zoom) / str(tx)
                folder.mkdir(parents=True, exist_ok=True)
                Image.fromarray(terrain_rgb(heights)).save(folder / f'{ty}.png', optimize=True)
                tile_count += 1
    for feature in display:
        feature['geometry'] = display_geometry(feature)
    display = [feature for feature in display if not shape(feature['geometry']).is_empty]
    write_json(args.output / 'contours.geojson', {'type': 'FeatureCollection', 'features': display})
    for feature in hydro['features']:
        feature['geometry'] = display_geometry(feature)
    hydro['features'] = [feature for feature in hydro['features'] if not shape(feature['geometry']).is_empty]
    write_json(args.output / 'hydro.geojson', hydro)
    for feature in water_reference:
        feature['geometry'] = display_geometry(feature)
    water_reference = [feature for feature in water_reference if not shape(feature['geometry']).is_empty]
    write_json(args.output / 'water.geojson', {'type': 'FeatureCollection', 'features': water_reference})
    historical_info = json.loads(subprocess.check_output(['gdalinfo', '-json', str(args.historical)]))
    if digest(args.historical) != 'adf13ce91e0579a6cc1b6462c5f88d93fa97c8516cb2cddabe2e8d55e8344ee4':
        raise ValueError('Unexpected Judique historical raster; review its provenance before replacing')
    png = args.cache / 'historical.png'
    subprocess.run(['gdal_translate', '-q', '-of', 'PNG', '-outsize', '3000', '0', str(args.historical), str(png)], check=True)
    Image.open(png).save(args.output / 'historical.webp', quality=88)
    merc_to_ll = Transformer.from_crs(3857, 4326, always_xy=True)
    corners = historical_info['cornerCoordinates']
    historical_corners = [list(merc_to_ll.transform(*corners[k])) for k in ['upperLeft', 'upperRight', 'lowerRight', 'lowerLeft']]
    receipt = {
        'name': 'Judique · Fletcher sheet 19', 'bounds': supported, 'inputBuffer': BUFFER,
        'generatedAt': datetime.now(timezone.utc).isoformat(), 'displaySimplificationMetres': 5,
        'method': 'NSTDB contour elevations; linear triangulation sampled at 30 m in UTM 20N, one-cell Gaussian display smoothing, then supported lakes flattened to contour-shoreline estimates and explicit ocean polygons set to display zero. Rivers and NSHN remain draped references, not drainage constraints.',
        'purpose': 'Provisional 3D inspection; not a watershed-ready or vertically validated DEM.',
        'verticalDatum': 'Contour source ZVALUE in metres; vertical datum and epoch not independently reconciled. NSHN heights are not used.',
        'sources': {'contours': CONTOURS, 'hydro': HYDRO, 'hydroLayers': [9, 11],
                    'licence': 'https://novascotia.ca/opendata/licence.asp',
                    'hydroCatalogue': 'https://open.canada.ca/data/en/dataset/2ed55c68-b7f8-4db0-15d9-bef40797a4c4'},
        'inputs': {p.name: digest(p) for p in [contours_path, hydro_path, water_path]},
        'waterSource': {'url': WATER, 'catalogue': 'https://data.novascotia.ca/d/h8jb-hzrm', 'licence': 'https://novascotia.ca/opendata/licence.asp', 'sourceWaterZUsed': False},
        'waterConditioning': water_conditioning, 'waterPolygonFeatures': len(water_reference),
        'contourFeatures': len(display), 'hydroFeatures': len(hydro['features']),
        'terrainCellMetres': cell, 'terrainMinZoom': 8, 'terrainMaxZoom': 12, 'tileCount': tile_count,
        'contourAgreement': {'rmsMetres': float(np.sqrt(np.mean(errors ** 2))), 'maxMetres': float(np.max(np.abs(errors))), 'independent': False},
        'historical': {'coordinates': historical_corners, 'sourceSha256': digest(args.historical),
                       'status': 'Full-sheet reviewed draft; alignment remains approximate. See reports/fletcher/full-sheets/inputs.json.',
                       'licence': 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
                       'source': 'https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012'},
    }
    receipt['artifacts'] = {str(p.relative_to(args.output)): digest(p) for p in sorted(args.output.rglob('*')) if p.is_file() and p.name != 'source.json'}
    write_json(args.output / 'source.json', receipt)
    print(json.dumps({k:receipt[k] for k in ['contourFeatures','hydroFeatures','contourAgreement','tileCount']}, indent=2))


if __name__ == '__main__':
    main()
