#!/usr/bin/env python3
"""Build a dated, open-licence Nova Scotia basemap archive (GDAL >= 3.8).

python3 tools/build_provincial_atlas.py --work-dir /tmp/ns-provincial-atlas
Downloads are cached by source release. Only a validated archive is installed.
No user locations, address points, parcel data or credentials are involved.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'roads': ('484g-adjn', 'roadsegid,segid,street,roadc_desc,feat_desc,rte_no,date_rev'),
    'names': ('xf3i-vxcb', 'cgndb_key,geoname,status_ds,concise_ds'),
    'water': ('h8jb-hzrm', 'feat_code,feat_desc'),
    'waterways': ('fpca-jrmt', 'feat_code,feat_desc'),
    'woodland': ('xed8-vvg5', 'feat_code,feat_desc'),
    'boundaries': ('7bqh-hssn', 'objectid,name,fullname,featdesc'),
}
MINZOOMS = {'roads_major': 5, 'roads_local': 10, 'roads_access': 12,
            'names': 5, 'water': 7, 'waterways': 11, 'woodland': 8, 'boundaries': 6}
MAXZOOM = 13
LICENCE = 'https://support.novascotia.ca/services/open-data-portal-licence'
ATTRIBUTION = 'Contains information licensed under the Open Government Licence – Nova Scotia'


def fetch(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as response:
                return json.load(response)
        except (OSError, ValueError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def query(source_id, **params):
    return fetch('https://data.novascotia.ca/resource/' + source_id + '.json?' +
                 urllib.parse.urlencode({'$' + k: v for k, v in params.items()}))


def validate_release(before, after, expected, actual):
    if not before or before != after or expected <= 0 or expected != actual:
        raise ValueError(f'Incomplete or changing release: {before}/{after}, {actual}/{expected} rows')


def feature_layer(source, properties):
    if source != 'roads':
        return source
    classification = properties.get('roadc_desc')
    if classification in ('Highway', 'Trans Canada', 'Arterial', 'Collector', 'Local Highway'):
        return 'roads_major'
    if classification in ('Local', 'Local Arterial', 'Local Collector', 'Ramp'):
        return 'roads_local'
    return 'roads_access'


def validate_row(source, row):
    geom = row.get('the_geom')
    allowed = {'names': ('Point', 'MultiPoint'),
               'roads': ('LineString', 'MultiLineString'),
               'waterways': ('LineString', 'MultiLineString')}.get(source, ('Polygon', 'MultiPolygon'))
    if not isinstance(geom, dict) or geom.get('type') not in allowed or not geom.get('coordinates'):
        raise ValueError(f'{source}: missing or unexpected geometry')
    if not isinstance(row.get('source_row_id'), str) or not row['source_row_id']:
        raise ValueError(f'{source}: missing source row identifier')
    properties = {k: v for k, v in row.items() if k != 'the_geom'}
    for key, value in properties.items():
        if value is not None and not isinstance(value, str):
            raise ValueError(f'{source}: invalid {key}')
    if source == 'roads' and not properties.get('roadsegid'):
        raise ValueError('Road segment has no source identifier')
    if source == 'names' and (not properties.get('cgndb_key') or not properties.get('geoname')):
        raise ValueError('Name has no source identifier or text')
    return {'type': 'Feature', 'geometry': geom, 'properties': properties}


def record_row(source, row):
    # An actual null geometry is source evidence, not a download failure. Retain
    # its identifier and rejection reason in the source receipt; never locate it.
    if row.get('the_geom') is None and isinstance(row.get('source_row_id'), str):
        return {'type': 'Feature', 'geometry': None,
                'properties': {k: v for k, v in row.items() if k != 'the_geom'},
                'rejectionReason': 'source-null-geometry'}
    return validate_row(source, row)


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def download(source, work):
    source_id, fields = SOURCES[source]
    metadata_url = f'https://data.novascotia.ca/api/views/{source_id}.json'
    meta = fetch(metadata_url)
    if meta.get('license', {}).get('name') != 'Nova Scotia Open Government Licence':
        raise ValueError(f'{source}: open-government licence must be reviewed')
    stamp = meta['rowsUpdatedAt']
    expected = int(query(source_id, select='count(*)')[0]['count'])
    geometry_expression = 'simplify_preserve_topology(the_geom, 2) as the_geom' if source == 'woodland' else 'the_geom'
    suffix = '-topology2m' if source == 'woodland' else ''
    path = work / f'{source}-{stamp}{suffix}.geojsonl'
    receipt_path = path.with_suffix('.receipt.json')
    if path.exists() and receipt_path.exists():
        receipt = json.loads(receipt_path.read_text())
        validate_release(stamp, receipt['releaseTimestamp'], expected, receipt['featureCount'])
        if sha256(path) != receipt['sha256']:
            raise ValueError(f'{source}: cached source checksum mismatch')
        print(f'{source}: verified cached {expected} records', flush=True)
        return path, receipt
    count, seen, rejected = 0, set(), []
    tmp = path.with_suffix('.partial')
    # Resume complete rows from this exact release; discard an interrupted tail.
    if tmp.exists():
        with tmp.open('rb+') as stream:
            valid_end = 0
            for line in stream:
                if not line.endswith(b'\n'):
                    break
                feature = json.loads(line)
                identifier = feature['properties']['source_row_id']
                if identifier in seen:
                    raise ValueError(f'{source}: duplicate cached row')
                seen.add(identifier)
                if feature.get('rejectionReason'):
                    rejected.append({'sourceRowId': identifier, 'reason': feature['rejectionReason']})
                count += 1
                valid_end += len(line)
            stream.truncate(valid_end)
        print(f'{source}: resuming at {count}/{expected}', flush=True)
    # Detailed woodland and shoreline records can be individually very large.
    page_size = 1000 if source in ('woodland', 'waterways') else 10000
    with tmp.open('a') as stream:
        def page(offset):
            return query(source_id, select=f':id as source_row_id,{geometry_expression},{fields}',
                         order=':id', limit=page_size, offset=offset)
        # Bound prefetch to four pages, including for large woodland polygons.
        for start in range(count, expected, page_size * 4):
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pages:
                for rows in pages.map(page, range(start, min(expected, start + page_size * 4), page_size)):
                    for row in rows:
                        feature = record_row(source, row)
                        identifier = row['source_row_id']
                        if identifier in seen:
                            raise ValueError(f'{source}: duplicate source row')
                        seen.add(identifier)
                        if feature.get('rejectionReason'):
                            rejected.append({'sourceRowId': identifier, 'reason': feature['rejectionReason']})
                        stream.write(json.dumps(feature, ensure_ascii=False, separators=(',', ':')) + '\n')
                        count += 1
                print(f'{source}: {count}/{expected}', flush=True)
    validate_release(stamp, fetch(metadata_url)['rowsUpdatedAt'], expected, count)
    tmp.replace(path)
    receipt = {'id': source_id, 'name': meta['name'], 'url': f'https://data.novascotia.ca/d/{source_id}',
               'metadataUrl': metadata_url, 'releaseTimestamp': stamp,
               'released': datetime.datetime.fromtimestamp(stamp, datetime.timezone.utc).isoformat(),
               'frequency': meta.get('metadata', {}).get('custom_fields', {}).get('Detailed Metadata', {}).get('Frequency'),
               'featureCount': count, 'rejectedRecords': rejected, 'sha256': sha256(path), 'licenceUrl': LICENCE,
               'geometryTransform': 'Topology-preserving simplification, 2 metre tolerance' if source == 'woodland' else 'None before tiling',
               'fields': ['source_row_id', *fields.split(',')]}
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    return path, receipt


def build(work, output):
    from osgeo import gdal, ogr, osr
    gdal.UseExceptions()
    ogr.UseExceptions()
    work.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        downloaded = dict(zip(SOURCES, pool.map(lambda s: download(s, work), SOURCES)))
    gpkg = work / 'provincial.gpkg'
    if gpkg.exists():
        gpkg.unlink()
    database = ogr.GetDriverByName('GPKG').CreateDataSource(str(gpkg))
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    layers, counts = {}, {}
    for source, (path, _) in downloaded.items():
        print(f'Preparing {source}', flush=True)
        database.StartTransaction()
        with path.open() as stream:
            for line in stream:
                feature = json.loads(line)
                if feature.get('rejectionReason'):
                    continue
                properties = feature['properties']
                name = feature_layer(source, properties)
                if name not in layers:
                    layer = database.CreateLayer(name, srs, ogr.wkbUnknown)
                    for field in ['source_row_id', *SOURCES[source][1].split(',')]:
                        layer.CreateField(ogr.FieldDefn(field, ogr.OFTString))
                    layers[name] = layer
                    counts[name] = 0
                geom = ogr.CreateGeometryFromJson(json.dumps(feature['geometry']))
                geom.FlattenTo2D()
                if geom.IsEmpty():
                    raise ValueError(f'{source}: empty geometry')
                envelope = geom.GetEnvelope()
                if not (-68 < envelope[0] <= envelope[1] < -57 and 42 < envelope[2] <= envelope[3] < 49):
                    raise ValueError(f'{source}: geometry outside expected geographic extent: {envelope}')
                record = ogr.Feature(layers[name].GetLayerDefn())
                record.SetGeometry(geom)
                for key, value in properties.items():
                    if value is not None:
                        record.SetField(key, value)
                layers[name].CreateFeature(record)
                counts[name] += 1
        database.CommitTransaction()
    layer = None
    layers.clear()
    database = None
    package(work, output, downloaded, counts)


def package(work, output, downloaded, counts):
    from osgeo import gdal, osr
    gdal.UseExceptions()
    gdal.SetConfigOption('GDAL_NUM_THREADS', '2')
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    gpkg = work / 'provincial.gpkg'
    for source, (_, receipt) in downloaded.items():
        actual = sum(value for name, value in counts.items() if name == source or (source == 'roads' and name.startswith('roads_')))
        expected = receipt['featureCount'] - len(receipt.get('rejectedRecords', []))
        if actual != expected:
            raise ValueError(f'{source}: prepared {actual}/{expected} accepted records')
    archive = work / 'provincial.pmtiles'
    if archive.exists():
        archive.unlink()
    config = {name: {'target_name': 'roads' if name.startswith('roads_') else name,
                     'minzoom': zoom, 'maxzoom': MAXZOOM} for name, zoom in MINZOOMS.items()}
    # Use the same GDAL runtime as preparation rather than an unrelated binary
    # earlier on PATH (older PMTiles drivers can crash on this conversion).
    print('Generating provincial vector tiles', flush=True)
    result = gdal.VectorTranslate(str(archive), str(gpkg), format='PMTiles',
        datasetCreationOptions=['MINZOOM=5', f'MAXZOOM={MAXZOOM}', 'EXTENT=8192',
          'SIMPLIFICATION=1', 'SIMPLIFICATION_MAX_ZOOM=0', 'MAX_SIZE=5000000',
          'MAX_FEATURES=1000000', 'NAME=NS Marks provincial geography', 'CONF=' + json.dumps(config)])
    if result is None:
        raise ValueError('Vector tile generation failed')
    result = None
    # Read the produced archive, not just the input, for the motivating regression.
    tiles = gdal.OpenEx(str(archive), gdal.OF_VECTOR)
    roads = tiles.GetLayerByName('roads')
    # Tile datasets expose Web Mercator geometry; transform the geographic query.
    target = roads.GetSpatialRef()
    transform = osr.CoordinateTransformation(srs, target)
    west, south, _ = transform.TransformPoint(-61.49, 45.80)
    east, north, _ = transform.TransformPoint(-61.45, 45.85)
    roads.SetSpatialFilterRect(west, south, east, north)
    if not any(f.GetField('street') == 'Chisholm-MacLean Rd' for f in roads):
        raise ValueError('Generated tiles lost Chisholm-MacLean Rd in Long Point')
    tiles = None
    digest = sha256(archive)
    output.mkdir(parents=True, exist_ok=True)
    filename = f'ns-{digest[:16]}.pmtiles'
    shutil.copyfile(archive, output / filename)
    receipt = {'schemaVersion': 1, 'archive': filename, 'sha256': digest,
               'bytes': archive.stat().st_size, 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'generator': 'tools/build_provincial_atlas.py', 'gdalVersion': gdal.VersionInfo('--version'),
               'minzoom': 5, 'maxzoom': MAXZOOM, 'extent': 8192,
               'attribution': ATTRIBUTION, 'licenceUrl': LICENCE,
               'coverage': 'Nova Scotia', 'layerCounts': counts,
               'sources': [r for _, r in downloaded.values()],
               'validation': {'longPointRoad': 'Chisholm-MacLean Rd'},
               'supplemental': 'OpenStreetMap via OpenFreeMap: ocean context, grass, farmland, settlement areas and building footprints.'}
    pending = output / 'source.pending.json'
    pending.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    pending.replace(output / 'source.json')
    print(f'Validated {output / filename}: {receipt["bytes"] / 1e6:.1f} MB', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'web/public/atlas/provincial')
    args = parser.parse_args()
    build(args.work_dir, args.output)
