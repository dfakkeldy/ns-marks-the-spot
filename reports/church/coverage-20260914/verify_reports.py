"""Replay new model phases, native measurements, original references and raster receipts."""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

import numpy as np
from osgeo import gdal
from shapely.geometry import MultiPoint, Point, Polygon
from tools.church.gcps import GroundControlPoint, load_gcps
from tools.church.landmarks import polygon_centroid
from tools.church.residuals import solve_affine
from tools.church.cutlines import Cutline

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
REPORTS=HERE.parent
R=HERE/'richmond'
OLD=REPORTS/'target-refinement-20260913/richmond'
BASE='683ec77ce970db6f1a997795008c8694ce305b8d'
sys.path.insert(0,str(REPORTS/'target-refinement-20260913'))
from score_models import score

def read(path):
    return json.loads(path.read_text())

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def compare(actual,expected):
    if isinstance(expected,dict):
        assert actual.keys()==expected.keys()
        for key in expected:
            compare(actual[key],expected[key])
    elif isinstance(expected,list):
        assert len(actual)==len(expected)
        for a,e in zip(actual,expected):
            compare(a,e)
    elif isinstance(expected,float):
        assert math.isclose(actual,expected,rel_tol=1e-9,abs_tol=1e-5),(actual,expected)
    else:
        assert actual==expected,(actual,expected)

def point(p):
    return GroundControlPoint(*p['pixel_xy'],*p['lonlat'],'check',p['id'])

def split(path):
    points=load_gcps(path)
    return ([p for p in points if p.role=='control'],[p for p in points if p.role=='check'])

subprocess.run(['git','merge-base','--is-ancestor',BASE,'origin/nightly'],check=True)
# These predecessor reports, production inputs and tools must remain byte-identical.
subprocess.run(['git','diff','--exit-code',BASE,'--','tools/church',
                'reports/church/physical-review-20260912','reports/church/physical-review-20260913',
                'reports/church/distributed-review-20260913','reports/church/target-refinement-20260913'],check=True)
controls=load_gcps(R/'affine14-controls.csv')
freeze=read(R/'affine14-freeze.json')
assert len(controls)==14 and all(p.role=='control' for p in controls)
assert digest(R/'affine14-controls.csv')==freeze['control_csv_sha256']
assert (R/'affine14-controls.csv').read_bytes()==(OLD/'candidate-controls.csv').read_bytes()
assert subprocess.check_output(['git','show',f'{BASE}:reports/church/target-refinement-20260913/richmond/candidate-controls.csv'])==(R/'affine14-controls.csv').read_bytes()
v4=split(REPORTS/'physical-review-20260912/richmond/refinement-04/frozen-fit.csv')[0]
old20=split(OLD/'distributed-14-tps.csv')[1]
eight=[point(p) for p in read(OLD/'fresh-six-observations.json')['points']]
additional_paths=sorted(R.glob('R*-observation.json'))
assert [p.stem for p in additional_paths]==['R36-observation','R37-observation']
eight += [point(read(path)) for path in additional_paths]
assert split(R/'additional-validation-review.csv')==(controls,eight[-2:])
assert split(R/'affine14-diagnostic-review.csv')==(controls,old20+eight)
assert len(old20+eight)==28
replays=0
for path in additional_paths:
    p=point(read(path));first=read(path.with_name(path.name.replace('observation','first')))
    assert first['observation_sha256']==digest(path)
    assert first['candidate_csv_sha256']==freeze['control_csv_sha256']
    compare(score(controls,[p],'tps'),first['candidate14'])
    compare(score(v4,[p],'tps'),first['v4'])
    replays+=2
for method,phases in read(R/'supported-model-audit.json')['models'].items():
    for name,checks in [('twenty_previous_diagnostics',old20),('eight_unchanged_postfreeze_observations',eight),('combined28_diagnostic_only',old20+eight)]:
        compare(score(controls,checks,method),phases[name])
        replays+=1

features={}
for reference in read(R/'terrain-preview-inputs.json')['water_inputs']:
    path=Path(reference['path'])
    assert digest(path)==reference['sha256']
    for f in read(path)['features']:
        if f['id'] in features:
            assert features[f['id']]['geometry']==f['geometry']
        features[f['id']]=f
fresh_paths=sorted((R/'affine14-fresh').glob('R*-observation.json'))
assert [read(p)['id'] for p in fresh_paths]==['R38','R39','R40','R41','R42','R44']
fresh=[point(read(path)) for path in fresh_paths]
assert not {p.label for p in fresh}&{p.label for p in controls+old20+eight}
assert not {(p.lon,p.lat) for p in fresh}&{(p.lon,p.lat) for p in controls+old20+eight}
assert split(R/'affine14-fresh-validation.csv')==(controls,fresh)
frames=read(R/'context-frames.json')
boundary_path=REPORTS/'physical-review-20260912/richmond/content-boundary.json'
assert digest(boundary_path)==freeze['boundary_sha256']
cutline=Cutline(tuple(map(tuple,read(boundary_path)['ring_pixel_xy'])))
for path in additional_paths+fresh_paths:
    p=read(path);frame=p['source_frame']
    assert frame['rotation']==0
    records=[f for f in frames.values() if f['frame']==frame and f['image_sha256']==p['source_crop_sha256']]
    assert len(records)==1
    assert digest(Path(records[0]['image_path']))==p['source_crop_sha256']
    assert p['source_sha256']==freeze['source_sha256']
    xy=p.get('source_display_pixel_xy')
    if xy is None:
        assert Polygon(p['source_outline_display_pixels']).is_valid
        xy=polygon_centroid(p['source_outline_display_pixels'])[:2]
    native=[frame['origin'][i]+xy[i]*frame['extent'][i]/frame['display'][i] for i in range(2)]
    assert np.allclose(native,p['pixel_xy'],atol=1e-8,rtol=0)
    assert cutline.contains(*native)
    if 'reference_vertex' in p:
        vertex=p['reference_vertex']
        ll=features[vertex['feature_id']]['geometry']['coordinates'][vertex['vertex']]
    else:
        ring=p['modern_ring']
        assert Polygon(ring).is_valid
        vertices={tuple(v) for id in p['reference_feature_ids'] for v in features[id]['geometry']['coordinates']}
        assert all(tuple(v) in vertices for v in ring)
        ll=polygon_centroid(ring)[:2]
    assert np.allclose(ll,p['lonlat'],atol=1e-10,rtol=0)
for path in fresh_paths:
    p=point(read(path));first=read(path.with_name(path.name.replace('observation','first')))
    assert first['observation_sha256']==digest(path)
    assert first['affine_freeze_sha256']==digest(R/'affine14-freeze.json')
    for name,cs,method in [('affine14',controls,'affine'),('v4_same_feature',v4,'tps'),('failed_tps14_same_feature',controls,'tps')]:
        compare(score(cs,[p],method),first[name]);replays+=1
    hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in controls]).convex_hull
    assert first['inside_source_control_hull']==hull.covers(Point(p.pixel_x,p.pixel_y))
for n in [3,6]:
    summary=read(R/f'affine14-fresh/fresh-summary-{n:02}.json')
    assert len(summary['observation_inputs'])==n
    for entry in summary['observation_inputs']:
        assert digest(R/'affine14-fresh'/entry['path'])==entry['sha256']
    for name,cs,method in [('affine14',controls,'affine'),('v4_same_features',v4,'tps'),('failed_tps14_same_features',controls,'tps')]:
        compare(score(cs,fresh[:n],method),summary[name]);replays+=1
erratum=read(R/'affine14-fresh/R40-context-erratum.json')
assert erratum['original_sha256']==digest(R/'affine14-fresh/R40-observation.json')
# Exact original junction topology and extrema corroborate point definitions.
for id,pairs in {'R37':[(169149,63),(169150,0),(273659,92)],'R38':[(197305,153),(273245,0),(273246,31)]}.items():
    path=R/f'{id}-observation.json' if id=='R37' else R/f'affine14-fresh/{id}-observation.json'
    ll=read(path)['lonlat']
    assert all(features[fid]['geometry']['coordinates'][v]==ll for fid,v in pairs)
for id,fid,axis,extreme in [('R36',13866,1,max),('R40',13724,1,min),('R44',5250,0,max)]:
    path=R/f'{id}-observation.json' if id=='R36' else R/f'affine14-fresh/{id}-observation.json'
    assert read(path)['lonlat'][axis]==extreme(p[axis] for p in features[fid]['geometry']['coordinates'])
fit=solve_affine(controls)
compare(dict(a=fit.a,b=fit.b,c=fit.c,d=fit.d,e=fit.e,f=fit.f),freeze['forward_affine'])
assert abs(fit.a*fit.e-fit.b*fit.d)>1
raster_receipt=read(R/'affine14-artifact-receipt.json')
coverage=read(R/'affine14-coverage.json')
assert raster_receipt['control_csv_sha256']==freeze['control_csv_sha256']
assert raster_receipt['boundary_sha256']==freeze['boundary_sha256']
assert raster_receipt['output_sha256']==coverage['raster_sha256']
assert coverage['passed'] and coverage['transparent_interior_cells']==0
raster=Path(coverage['raster'])
assert digest(raster)==raster_receipt['output_sha256']
gdal.UseExceptions();ds=gdal.Open(str(raster))
assert [ds.RasterXSize,ds.RasterYSize]==raster_receipt['size']
assert list(ds.GetGeoTransform())==raster_receipt['geotransform']
windows=read(R/'warped-review/receipt.json')
assert len(windows['reviews'])==6
for review in windows['reviews']:
    assert review['observation_pixel_alpha']>0
    assert digest(R/'warped-review'/review['figure'])==review['figure_sha256']
print(json.dumps(dict(numerical_replays=replays,source_reference_observations=len(additional_paths+fresh_paths),fresh_affine_checks=len(fresh),preserved_predecessor_inputs=True,raster_sha256=digest(raster),geographic_acceptance=False),indent=2))
