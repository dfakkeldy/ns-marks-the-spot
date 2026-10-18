"""Replay immutable first results, observations, prior phases and raster evidence."""
import hashlib
import json
import math
from pathlib import Path
import sys
import subprocess
import numpy as np
from shapely.geometry import MultiPoint,Point,Polygon
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.landmarks import polygon_centroid
from tools.church.cutlines import Cutline
HERE=Path(__file__).resolve().parent
R=HERE/'richmond'
REPORTS=HERE.parent
OLD=REPORTS/'coverage-20260914/richmond'
sys.path.insert(0,str(REPORTS/'target-refinement-20260913'))
from score_models import score

def read(p):return json.loads(p.read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def point(p):return GroundControlPoint(*p['pixel_xy'],*p['lonlat'],'check',p['id'])
def compare(a,b):
    if isinstance(b,dict):
        assert a.keys()==b.keys()
        for k in b:compare(a[k],b[k])
    elif isinstance(b,list):
        assert len(a)==len(b)
        for x,y in zip(a,b):compare(x,y)
    elif isinstance(b,float):assert math.isclose(a,b,rel_tol=1e-9,abs_tol=1e-5),(a,b)
    else:assert a==b,(a,b)
plan=read(R/'phase-plan.json');base=plan['frozen_input_commit']
subprocess.run(['git','merge-base','--is-ancestor',base,'origin/nightly'],check=True)
subprocess.run(['git','diff','--exit-code',base,'--','tools/church','reports/church/physical-review-20260912','reports/church/physical-review-20260913','reports/church/distributed-review-20260913','reports/church/target-refinement-20260913','reports/church/coverage-20260914'],check=True)
assert digest(OLD/'affine14-controls.csv')==plan['control_csv_sha256']
assert digest(OLD/'affine14-freeze.json')==plan['affine_freeze_sha256']
controls=load_gcps(OLD/'affine14-controls.csv')
previous=[p for p in load_gcps(OLD/'affine14-fresh-validation.csv') if p.role=='check']
diag=[p for p in load_gcps(OLD/'affine14-diagnostic-review.csv') if p.role=='check']
v4=[p for p in load_gcps(REPORTS/'physical-review-20260912/richmond/refinement-04/frozen-fit.csv') if p.role=='control']
paths=sorted((R/'observations').glob('R*.json'));added=[point(read(p)) for p in paths]
assert [p.label for p in added]==['R45','R46','R48','R49','R50','R51','R52','R53']
allpoints=controls+previous+diag+added
assert len({p.label for p in allpoints})==len(allpoints)
assert len({(p.lon,p.lat) for p in allpoints})==len(allpoints)
assert load_gcps(R/'additional-validation.csv')==controls+added
assert load_gcps(R/'cumulative-validation.csv')==controls+previous+added
frames=read(R/'context-frames.json');features={}
def reference(p):
    if 'reference_path' in p:return Path(p['reference_path']),p['reference_sha256']
    receipt=read(R/'observations'/p['reference_extract'])
    return Path(receipt['path']),receipt['sha256']
for path in paths:
    p=read(path);ref,sha=reference(p);assert digest(ref)==sha
    if str(ref) not in features:features[str(ref)]={f['id']:f for f in read(ref)['features']}
hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in controls]).convex_hull
cutline=Cutline(tuple(map(tuple,read(REPORTS/'physical-review-20260912/richmond/content-boundary.json')['ring_pixel_xy'])))
replays=0
for path in paths:
    p=read(path);frame=p['source_frame'];frame_record=frames[p['id']]
    assert frame_record['frame']==frame and frame['rotation']==0
    assert digest(Path(frame_record['image_path']))==p['source_crop_sha256']==frame_record['image_sha256']
    assert p['source_sha256']==read(OLD/'affine14-freeze.json')['source_sha256']
    xy=p.get('source_display_pixel_xy')
    if xy is None:
        assert Polygon(p['source_outline_display_pixels']).is_valid
        xy=polygon_centroid(p['source_outline_display_pixels'])[:2]
    native=[frame['origin'][i]+xy[i]*frame['extent'][i]/frame['display'][i] for i in range(2)]
    assert np.allclose(native,p['pixel_xy'],atol=1e-8,rtol=0) and cutline.contains(*native)
    fs=features[str(reference(p)[0])]
    if 'reference_vertex' in p:
        v=p['reference_vertex'];ll=fs[v['feature_id']]['geometry']['coordinates'][v['vertex']]
    else:
        ring=p['modern_ring'];assert Polygon(ring).is_valid
        vertices={tuple(v) for id in p['reference_feature_ids'] for v in fs[id]['geometry']['coordinates']}
        assert all(tuple(v) in vertices for v in ring)
        ll=polygon_centroid(ring)[:2]
    assert np.allclose(ll,p['lonlat'],atol=1e-10,rtol=0)
    first=read(R/'first-results'/path.name);assert first['observation_sha256']==digest(path)
    assert first['affine_freeze_sha256']==plan['affine_freeze_sha256']
    for name,cs,method in [('affine14',controls,'affine'),('v4_same_feature',v4,'tps'),('failed_tps14_same_feature',controls,'tps')]:
        compare(score(cs,[point(p)],method),first[name]);replays+=1
    assert first['inside_source_control_hull']==hull.covers(Point(*native))
for n in range(1,9):
    phase=read(R/'first-results'/f'phase-{n:02}.json')
    assert len(phase['new_observations'])==n
    for e in phase['new_observations']:assert digest(R/e['path'])==e['sha256']
    for name,cs,ps,method in [('additional',controls,added[:n],'affine'),('cumulative',controls,previous+added[:n],'affine'),('v4_cumulative_same_features',v4,previous+added[:n],'tps')]:
        compare(score(cs,ps,method),phase[name]);replays+=1
windows=read(R/'warped-review/receipt.json');assert len(windows['reviews'])==8
for w in windows['reviews']:
    assert w['observation_pixel_alpha']>0 and digest(R/'warped-review'/w['figure'])==w['figure_sha256']
for e in read(R/'Breeches-name-erratum.json')['originals']:assert digest(Path(e['path']))==e['sha256']
assert not (R/'first-results/R47.json').exists()
compare(read(HERE/'accuracy-summary.json')['affine14'],read(R/'first-results/phase-08.json')['cumulative'])
print(json.dumps(dict(numerical_replays=replays,new_source_reference_observations=8,cumulative_fresh_checks=14,predecessors_unchanged=True,actual_raster_windows=8,geographic_acceptance=False),indent=2))
