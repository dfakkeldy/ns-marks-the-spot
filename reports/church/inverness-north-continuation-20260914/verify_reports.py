"""Replay the northern-tip trial, immutable first checks and native/raster evidence."""
import hashlib,json,math,subprocess,sys
from pathlib import Path
import numpy as np
from osgeo import gdal
from shapely.geometry import MultiPoint,Point
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.landmarks import polygon_centroid
from tools.church.residuals import solve_affine,residual_metres,rms
from tools.church.cutlines import Cutline
HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'distributed-review-20260913/inverness-north'
TRIAL=HERE/'north-tip-trial'
CACHE=Path('/Users/dfakkeldy/Downloads/church-north-continuation-20260914')
sys.path.insert(0,str(HERE.parent/'target-refinement-20260913'))
from score_models import score

def read(p):return json.loads(p.read_text())
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def compare(a,b):
 if isinstance(b,dict):
  assert a.keys()==b.keys()
  for k in b:compare(a[k],b[k])
 elif isinstance(b,list):
  assert len(a)==len(b)
  for x,y in zip(a,b):compare(x,y)
 elif isinstance(b,float):assert math.isclose(a,b,rel_tol=1e-9,abs_tol=1e-5),(a,b)
 else:assert a==b,(a,b)
def point(p,role='check'):return GroundControlPoint(*p['pixel_xy'],*p['lonlat'],role,p['id'])
plan=read(HERE/'phase-plan.json');base=plan['frozen_input_commit']
subprocess.run(['git','merge-base','--is-ancestor',base,'origin/nightly'],check=True)
subprocess.run(['git','diff','--exit-code',base,'--','tools/church','reports/church/physical-review-20260912','reports/church/physical-review-20260913','reports/church/distributed-review-20260913','reports/church/target-refinement-20260913','reports/church/coverage-20260914','reports/church/coverage-continuation-20260914'],check=True)
c4=load_gcps(OLD/'corrected-I10-frozen.csv');assert digest(OLD/'corrected-I10-frozen.csv')==plan['controls_sha256']
c5=load_gcps(TRIAL/'controls.csv');freeze=read(TRIAL/'freeze.json');assert digest(TRIAL/'controls.csv')==freeze['controls_csv_sha256']
assert c5[:4]==c4 and len(c5)==5
p14=read(HERE/'observations/I14.json');p15=read(HERE/'observations/I15.json');assert c5[-1]==point(p14,'control')
d=[p for p in load_gcps(OLD/'diagnostic-review.csv') if p.role=='check']+[p for p in load_gcps(OLD/'fresh-validation-review.csv') if p.role=='check'];assert [p.label for p in d]==['N03','I13']
assert load_gcps(TRIAL/'diagnostic-review.csv')==c5+d
assert load_gcps(TRIAL/'fresh-validation.csv')==c5+[point(p15)]
assert len({(p.lon,p.lat) for p in c5+d+[point(p15)]})==8
boundary=read(HERE/'content-boundary.json');poly=Cutline(tuple(map(tuple,boundary['ring_pixel_xy'])))
for p in [p14,p15]:
 frame=p['source_frame'];assert frame['rotation']==0
 xy=[frame['origin'][i]+p['source_display_pixel_xy'][i]*frame['extent'][i]/frame['display'][i] for i in range(2)];assert np.allclose(xy,p['pixel_xy'],atol=1e-8,rtol=0) and poly.contains(*xy)
 path=Path(p.get('source_crop_path',p.get('source_detail_path')));sha=p.get('source_crop_sha256',p.get('source_detail_sha256'));assert digest(path)==sha
 ref=Path(p['reference_path']);assert digest(ref)==p['reference_sha256'];fs={f['id']:f for f in read(ref)['features']};v=p['reference_vertex'];coords=fs[v['feature_id']]['geometry']['coordinates'];assert coords[v['vertex']]==p['lonlat']
 axis=1 if p['id']=='I14' else 0
 assert p['lonlat'][axis]==(max if axis==1 else min)(q[axis] for q in coords)
first14=read(HERE/'first-results/I14.json');assert first14['observation_sha256']==digest(HERE/'observations/I14.json');compare(score(c4,[point(p14)],'affine'),first14['affine4'])
assert not MultiPoint([(p.pixel_x,p.pixel_y) for p in c4]).convex_hull.covers(Point(*p14['pixel_xy']))
models=read(TRIAL/'results.json')['models']
for key,c,method in [('four_control_same_two',c4,'affine'),('five_control_affine',c5,'affine'),('five_control_tps',c5,'tps')]:compare(score(c,d,method),models[key])
first15=read(TRIAL/'I15-first.json');assert first15['observation_sha256']==digest(HERE/'observations/I15.json') and first15['freeze_sha256']==digest(TRIAL/'freeze.json')
compare(score(c5,[point(p15)],'tps'),first15['tps5']);compare(score(c4,[point(p15)],'affine'),first15['affine4_same_feature'])
assert MultiPoint([(p.pixel_x,p.pixel_y) for p in c5]).convex_hull.covers(Point(*p15['pixel_xy']))
roles=read(TRIAL/'role-changes.json');assert roles['source_observation_sha256']==digest(HERE/'observations/I14.json') and roles['excluded_from_checks']==['I14']
fit=read(HERE/'control-fitting-diagnostics.json');compare(fit['rms_ground_m'],rms(residual_metres(c4,solve_affine(c4))))
gdal.UseExceptions()
for receipt,image in [('native-window-comparison.json','IN2-lowland-native.png'),('blair-native-comparison.json','IN2-blair-native.png'),('presquile-native-comparison.json','IN2-presquile-native.png'),('corney-native-comparison.json','IN2-corney-native.png')]:
 p=read(HERE/receipt);ds=gdal.Open(str(CACHE/image));a=ds.ReadAsArray();assert hashlib.sha256(a.tobytes()).hexdigest()==p['original_decoded_sha256']==p['working_decoded_sha256'];assert p['decoded_native_arrays_equal'] and p['max_channel_difference']==0
assert not read(HERE/'source-crop-comparison.json')['pixels_equal']
source=Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/inverness.jp2');assert digest(source)==read(HERE/'source-hash-verification.json')['sha256']
for prefix,folder in [('baseline-','rendered'),('north-tip-trial/','tps5-rendered')]:
 r=read(HERE/(prefix+'artifact-receipt.json'));coverage=read(HERE/(prefix+'coverage.json'));local=CACHE/folder/Path(r['output']).name;assert digest(local)==r['output_sha256']==coverage['raster_sha256'];assert coverage['passed'] and coverage['transparent_interior_cells']==0
 ds=gdal.Open(str(local));assert [ds.RasterXSize,ds.RasterYSize]==r['size'];assert list(ds.GetGeoTransform())==r['geotransform']
r=read(TRIAL/'artifact-receipt.json');assert r['controls_sha256']==freeze['controls_csv_sha256'] and r['freeze_sha256']==digest(TRIAL/'freeze.json');assert r['orientation']['nonnegative_determinants']==0
windows=read(HERE/'warped-review/receipt.json');assert windows['raster_sha256']==r['output_sha256'] and len(windows['reviews'])==4
for w in windows['reviews']:assert digest(HERE/'warped-review'/w['figure'])==w['sha256'] and w['source_pixel_alpha']>0
assert read(HERE/'accuracy-summary.json')['current_tps5_fresh']==first15['tps5']
print(json.dumps(dict(numerical_replays=6,native_observations=2,exact_native_source_windows=4,current_fresh_checks=1,diagnostics=2,actual_raster_windows=4,predecessors_unchanged=True,geographic_acceptance=False),indent=2))
