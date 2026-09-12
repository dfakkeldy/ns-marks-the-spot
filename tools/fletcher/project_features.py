"""Project explicitly reviewed Fletcher source marks; never substitute lettering.

Uses the existing point/group placement contract and frozen lettering pipeline
inputs. Earlier pilot geometry remains in each replacement record. A local
correction takes precedence over the computed source prediction.
"""
import argparse
import copy
import shutil
from pathlib import Path

from . import project_labels as labels
from .annotation_placement import place_review, source_geometry

REPORT = Path('reports/fletcher/feature-geography')
PILOT = Path('reports/fletcher/placement-pilot')


def native_points(geometry):
    if geometry['type'] == 'Point':
        return [geometry['coordinates']]
    if geometry['type'] == 'LineString':
        return geometry['coordinates']
    if geometry['type'] == 'Polygon':
        return [p for ring in geometry['coordinates'] for p in ring]
    return [p for polygon in geometry['coordinates'] for ring in polygon for p in ring]


def project(sheet, executable):
    fit, boundary, inventory, manifest, controls, _, provenance = labels.load_inputs(sheet)
    review_path = REPORT / f'sheet-{sheet}-source-review.json'
    review = labels.read(labels.ROOT / review_path)
    labels.require(review['source_sha256'] == inventory['source_sha256'] and
                   review['source_dimensions_px'] == inventory['source_dimensions_px'], 'Review source mismatch')
    associations = {}
    previous = {}
    locality = {}
    inputs = {str(review_path): labels.digest(labels.ROOT / review_path)}
    placement_reviews = {}
    placement_path = REPORT / f'sheet-{sheet}-placement-review.json'
    if (labels.ROOT / placement_path).exists():
        placement = labels.read(labels.ROOT / placement_path)
        labels.require(placement['fit_sha256'] == provenance['fit_sha256'] and
                       placement['source_review_sha256'] == inputs[str(review_path)], 'Stale placement review')
        placement_reviews = {r['annotation_id']: r for r in placement['reviews']}
        inputs[str(placement_path)] = labels.digest(labels.ROOT / placement_path)
    if sheet == 19:
        for name in ('source-review.json', 'mapped-annotations.geojson', 'locality-review.json'):
            inputs[str(PILOT / name)] = labels.digest(labels.ROOT / PILOT / name)
        associations = {a['annotation_id']: a for a in labels.read(labels.ROOT/PILOT/'source-review.json')['associations']}
        previous = {f['id']: f for f in labels.read(labels.ROOT/PILOT/'mapped-annotations.geojson')['features']}
        locality = labels.read(labels.ROOT/PILOT/'locality-review.json')
    for row in review['associations']:
        labels.require(row['annotation_id'] not in associations, 'Duplicate/replaced source review requires explicit revision history')
        associations[row['annotation_id']] = row
    original = {a['id']: a for a in inventory['annotations']}
    labels.require(set(associations) <= set(original), 'Unknown source annotation')
    hull = labels.hull([p['pixel_xy'] for p in controls])
    def transform(points):
        labels.require(all(labels.inside(p, boundary['ring_pixel_xy']) for p in points), 'Reviewed source geometry outside neatline')
        return [labels.lonlat(p) for p in labels.transform(controls, points, executable)]
    features = []
    for aid, association in sorted(associations.items()):
        native = source_geometry(association, inventory['source_dimensions_px'])
        if native and not all(labels.inside(p, boundary['ring_pixel_xy']) for p in native_points(native)):
            placed = {'geometry': None, 'source_geometry_native': native,
                      'placement_status': 'outside-fit-neatline', 'alignment_status': 'draft-supported-area'}
        else:
            placed = place_review(association, inventory['source_dimensions_px'], hull, transform, 'draft-supported-area')
        prior = previous.get(aid)
        decision = locality.get(aid.split('-')[-1], {})
        correction = decision.get('placement_correction')
        geometry = placed['geometry']
        status = placed['placement_status']
        if placed['source_geometry_native'] is None:
            status = 'source-location-unresolved'
            geographic_role = 'unlocated-source-feature'
            geometry_meaning = 'Source label reviewed, but no distinct feature mark or defensible group identified. No feature location is asserted.'
        elif placed['source_geometry_native']['type'] == 'Point':
            geographic_role = 'reviewed-source-mark'
            geometry_meaning = 'Approximate historical mark location; not a surveyed site, current condition, ownership or access.'
        elif placed['source_geometry_native']['type'] == 'LineString':
            geographic_role = 'reviewed-source-line'
            if 'road' in original[aid]['kind']:
                geometry_meaning = 'Approximate traced axis of a printed historical road section. Endpoints delimit reviewed source evidence, not the complete named route. No present road alignment, condition, destination or access is asserted.'
            elif 'railway' in original[aid]['kind'] and 'PROPOSED' in original[aid]['source_text'].upper():
                geometry_meaning = 'Approximate traced axis of a printed historical railway proposal. Endpoints delimit reviewed source evidence, not the complete proposal. Construction, operation, a current railway and present access are not established.'
            else:
                geometry_meaning = 'Approximate traced portion of a historical linear feature. Endpoints delimit reviewed source evidence, not its full extent or an exact falls site. No current condition or access is asserted.'
        else:
            geographic_role = 'reviewed-source-group'
            geometry_meaning = 'Approximate source-symbol group; individual feature unresolved. Outline is not a property, footprint or error bound.'
        if correction:
            labels.require(correction['status'] == 'locally-reviewed-approximate' and
                           correction['geometry']['coordinates'] == correction['modern_reference']['geometry_lonlat'], 'Unsupported correction')
            geometry = copy.deepcopy(correction['geometry'])
            status = correction['status']
        a = original[aid]
        x,y,w,h = a['source_label_boxes_xywh'][0]
        left,top = max(0,int(x+w/2-330)),max(0,int(y+h/2-225))
        left,top = min(left,inventory['source_dimensions_px'][0]-660),min(top,inventory['source_dimensions_px'][1]-450)
        properties = {
            'annotation_id': aid, 'sheet': sheet, 'name': a['source_text'],
            'source_text': a['source_text'], 'kind': a['kind'], 'reading_status': a['reading_status'],
            'source_annotation': a, 'source_review': association,
            'source_sha256': inventory['source_sha256'], 'source_dimensions_px': inventory['source_dimensions_px'],
            'source_geometry_native': placed['source_geometry_native'],
            'map_derived_geometry': placed['geometry'], 'placement_status': status,
            'alignment_status': placed['alignment_status'], 'fit_revision': provenance['fit_revision'],
            'fit_sha256': provenance['fit_sha256'], 'fit_path': provenance['fit_path'],
            'geographic_role': geographic_role,
            'geometry_meaning': geometry_meaning,
            'geographic_review_status': 'pending-current-fit-review',
            'prior_locality_review': decision or None,
            'source_crop': {'native_xywh':[left,top,660,450], 'display_size':[660,450], 'rotation_degrees':0},
            'source_context_url': f"https://www.davidrumsey.com/luna/servlet/iiif/{manifest['rumsey_id']}/{left},{top},660,450/660,450/0/default.jpg",
            'source_url': manifest['manifest_url'], 'credit': manifest['credit'],
            'imagery_licence_url': manifest['imagery_licence_url'],
            'publication_status': 'research-preview-only',
            'previous_placements': ([{'evidence_path':str(PILOT/'mapped-annotations.geojson'),
                                     'evidence_sha256':inputs[str(PILOT/'mapped-annotations.geojson')],
                                     'feature':prior,
                                     'replacement_reason':'Explicit reprojection of unchanged reviewed source geometry through current merged 44-control fit; local corrections retained.'}] if prior else []),
        }
        if aid in placement_reviews:
            properties['geographic_review_status'] = placement_reviews[aid]['status']
            properties['placement_review'] = placement_reviews[aid]
        if correction:
            properties['placement_correction'] = correction
            properties['geometry_basis'] = 'local-review-with-modern-church-reference'
        features.append({'type':'Feature', 'id':aid, 'geometry':geometry, 'properties':properties})
    return {'type':'FeatureCollection', 'sheet':sheet,
            'provenance':{**provenance, 'source_review_inputs_sha256':inputs},
            'coordinate_convention':'Original scan continuous pixel edges x right/y down. No crop offset, resize or half-pixel shift applied. GDAL TPS EPSG:3857 -> OGC:CRS84 longitude/latitude.',
            'coverage':'Conservative source-control hull and native neatline. Outside records retain null map-derived geometry.',
            'accuracy':'Approximate historical map projection; fit checks and joins remain uneven. Source review does not prove modern site identity.',
            'features':features}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sheet',type=int,choices=labels.SHEETS,required=True)
    parser.add_argument('--out',type=Path,default=labels.ROOT/REPORT)
    parser.add_argument('--gdaltransform',default=shutil.which('gdaltransform'))
    args=parser.parse_args()
    labels.require(args.gdaltransform, 'GDAL is required')
    result=project(args.sheet,args.gdaltransform)
    labels.write(args.out/f'sheet-{args.sheet}-features.geojson',result)
    reviewed = sum(f['properties']['geographic_review_status'] == 'approximate-placement-reviewed' for f in result['features'])
    print(f"{len(result['features'])} reviewed source records; {sum(f['geometry'] is not None for f in result['features'])} derived/corrected geometries; {reviewed} approximate placements reviewed")

if __name__=='__main__':
    main()
