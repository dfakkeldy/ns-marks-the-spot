#!/usr/bin/env python3
"""Build the Atlas Crown Land display archive with GDAL >= 3.8 and GEOS.

python3 tools/build_crown_atlas.py --work-dir /tmp/ns-crown-atlas
The source snapshot is cached outside Git. Dissolve before simplification or
tiling; render the resulting polygons as fills without boundary strokes.
"""
import argparse
import datetime
import json
from pathlib import Path
import shutil

from build_provincial_atlas import (ATTRIBUTION, LICENCE, ROOT, download,
                                    polygonal_parts, repair_polygon, sha256)

SOURCE = ('3nka-59nz', 'dnr_id,pgpi,fcode,partialown,hectares,acres,symbol,shape_leng,shape_area')
MINZOOM, MAXZOOM = 5, 13
NOTE = ('Project-derived union of mapped Crown Land, including full or partial provincial interest. '
        'Fill only, without boundary lines; holes and disconnected areas retained. '
        'Not a parcel survey, ownership determination or permission to enter.')


def dissolve(geometries):
    from osgeo import ogr
    collection = ogr.Geometry(ogr.wkbMultiPolygon)
    for geometry in geometries:
        for polygon in polygonal_parts(geometry):
            collection.AddGeometry(polygon)
    if collection.IsEmpty():
        raise ValueError('No accepted Crown Land geometry')
    merged = collection.UnionCascaded()
    if merged is None or merged.IsEmpty() or not merged.IsValid():
        raise ValueError('Crown Land union failed')
    return merged


def build(work, output):
    from osgeo import gdal, ogr, osr
    gdal.UseExceptions()
    ogr.UseExceptions()
    work.mkdir(parents=True, exist_ok=True)
    path, source = download('crown', work, SOURCE)
    geometries, rejected, repairs = [], [], 0
    for line in path.open():
        feature = json.loads(line)
        if feature.get('rejectionReason'):
            rejected.append({'sourceRowId': feature['properties']['source_row_id'],
                             'dnrId': feature['properties'].get('dnr_id'),
                             'reason': feature['rejectionReason']})
            continue
        geom = ogr.CreateGeometryFromJson(json.dumps(feature['geometry']))
        geom.FlattenTo2D()
        geom, repaired = repair_polygon(geom)
        repairs += repaired
        if geom is None:
            rejected.append({'sourceRowId': feature['properties']['source_row_id'],
                             'reason': 'geometry-collapsed-on-repair'})
            continue
        west, east, south, north = geom.GetEnvelope()
        if not (-68 < west <= east < -57 and 42 < south <= north < 49):
            rejected.append({'sourceRowId': feature['properties']['source_row_id'],
                             'dnrId': feature['properties']['dnr_id'],
                             'reason': 'source-geometry-outside-expected-provincial-extent',
                             'bounds': [west, south, east, north]})
            continue
        geometries.append(geom)
    if len(geometries) + len(rejected) != source['featureCount']:
        raise ValueError('Accepted and rejected Crown Land counts do not reconcile')
    print(f'Dissolving {len(geometries)} Crown Land records', flush=True)
    merged = dissolve(geometries)
    del geometries
    # Keep source coordinates for the union. Generalize only the merged result,
    # never snap/buffer parcels to bridge real gaps or infer missing ownership.
    display = merged.SimplifyPreserveTopology(0.000018)
    if display is None or display.IsEmpty() or not display.IsValid():
        raise ValueError('Crown Land display generalization failed')
    components = polygonal_parts(merged)
    display_parts = polygonal_parts(display)
    holes = lambda parts: sum(part.GetGeometryCount() - 1 for part in parts)
    if len(components) != len(display_parts) or holes(components) != holes(display_parts):
        raise ValueError('Crown Land generalization changed components or holes')
    relative_area_change = abs(display.GetArea() - merged.GetArea()) / merged.GetArea()
    if relative_area_change > 0.001:
        raise ValueError('Crown Land generalization changed area by more than 0.1%')
    gpkg = work / 'crown.gpkg'
    gpkg.unlink(missing_ok=True)
    database = ogr.GetDriverByName('GPKG').CreateDataSource(str(gpkg))
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    layer = database.CreateLayer('crown', srs, ogr.wkbPolygon)
    layer.CreateField(ogr.FieldDefn('display_id', ogr.OFTInteger))
    database.StartTransaction()
    for index, geom in enumerate(display_parts):
        feature = ogr.Feature(layer.GetLayerDefn())
        feature.SetField('display_id', index)
        feature.SetGeometry(geom)
        layer.CreateFeature(feature)
    database.CommitTransaction()
    feature = layer = database = None
    archive = work / 'crown.pmtiles'
    archive.unlink(missing_ok=True)
    gdal.SetConfigOption('GDAL_NUM_THREADS', '2')
    print('Tiling dissolved fill', flush=True)
    result = gdal.VectorTranslate(str(archive), str(gpkg), format='PMTiles',
        datasetCreationOptions=[f'MINZOOM={MINZOOM}', f'MAXZOOM={MAXZOOM}', 'EXTENT=8192',
            'SIMPLIFICATION=1', 'SIMPLIFICATION_MAX_ZOOM=0', 'MAX_SIZE=5000000',
            'MAX_FEATURES=1000000', 'NAME=NS Marks dissolved Crown Land'])
    if result is None:
        raise ValueError('Crown Land tiling failed')
    result = None
    tiles = gdal.OpenEx(str(archive), gdal.OF_VECTOR, open_options=[f'ZOOM_LEVEL={MAXZOOM}'])
    layer = tiles.GetLayerByName('crown')
    if layer is None or layer.GetNextFeature() is None or tiles.GetLayerCount() != 1:
        raise ValueError('Generated Crown Land archive must contain only the polygon fill')
    layer = tiles = None
    digest = sha256(archive)
    filename = f'crown-{digest[:16]}.pmtiles'
    source.update(rejectedRecords=rejected, repairedGeometries=repairs,
                  geometryTransform='Raw source download; see archive transform for repair, dissolve and display generalization')
    receipt = {'schemaVersion': 1, 'archive': filename, 'sha256': digest, 'bytes': archive.stat().st_size,
               'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'generator': 'tools/build_crown_atlas.py', 'gdalVersion': gdal.VersionInfo('--version'),
               'minzoom': MINZOOM, 'maxzoom': MAXZOOM, 'extent': 8192,
               'attribution': ATTRIBUTION, 'licenceUrl': LICENCE, 'source': source, 'note': NOTE,
               'transform': 'GEOS MakeValid structure repair; full-precision cascaded union; topology-preserving '
                            '0.000018 degree simplification (at most 2 m); unoutlined polygon fill. '
                            'MVT display quantization at 8192 units per tile; no parcel attributes assigned to union components.',
               'validation': {'acceptedRecords': source['featureCount'] - len(rejected),
                              'components': len(components), 'holes': holes(components),
                              'relativeAreaChange': relative_area_change}}
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(archive, output / filename)
    (output / 'source.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(f'Validated {filename}: {receipt["bytes"] / 1e6:.1f} MB; {receipt["validation"]}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'web/public/atlas/crown')
    args = parser.parse_args()
    build(args.work_dir, args.output)
