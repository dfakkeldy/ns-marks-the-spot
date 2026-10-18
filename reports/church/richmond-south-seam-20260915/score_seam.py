"""Compute frozen-fit ground errors and paired source-feature separation."""
from pathlib import Path
import json,math,subprocess,sys
from tools.church.gcps import GroundControlPoint,load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.geometry import mercator_to_lonlat
R=Path(__file__).resolve().parent;ROOT=R.parents[2]
sys.path.insert(0,str(R.parent/'target-refinement-20260913'));from score_models import score

def read(p):return json.loads(p.read_text())
def residual(a,b):
 e=6371008.8*math.radians(a[0]-b[0])*math.cos(math.radians((a[1]+b[1])/2));n=6371008.8*math.radians(a[1]-b[1]);return dict(east_ground_m=e,north_ground_m=n,error_ground_m=math.hypot(e,n))
def predict(cs,xy,method):
 args=['-tps'] if method=='tps' else ['-order','1'];s=subprocess.check_output(['gdaltransform',*args,*build_gcp_arguments(cs)],input=f'{xy[0]} {xy[1]}\n',text=True);return list(mercator_to_lonlat(*map(float,s.split()[:2])))
def calculate():
 f=read(R/'freeze.json');rc=load_gcps(R/'richmond-controls.csv');sc=load_gcps(R/'south-controls.csv');old=read(ROOT/f['inputs']['south_original_controls']['path']);south_c=next(v for v in old['points'] if v['id']=='IS11');south_check=read(ROOT/f['inputs']['south_cranberry']['path']);pairs=[]
 for rid,south in [('R54',south_check),('R55',south_c)]:
  o=read(R/'observations'/(rid+'.json'));a=predict(rc,o['pixel_xy'],'affine');b=predict(sc,south['pixel_xy'],'tps');pairs.append(dict(richmond_id=rid,south_id=south['id'],richmond_role='fresh check',south_role='fresh check of TPS13' if rid=='R54' else 'TPS13 control; not independent validation',common_reference_lonlat=o['lonlat'],richmond_prediction_lonlat=a,south_prediction_lonlat=b,richmond_error=residual(a,o['lonlat']),south_error_against_common_reference=residual(b,o['lonlat']),richmond_minus_south=residual(a,b),original_south_reference_lonlat=south['lonlat'],common_reference_difference_from_original_south=residual(o['lonlat'],south['lonlat'])))
 return {'pairs':pairs,'seam_rms_ground_m':math.sqrt(sum(p['richmond_minus_south']['error_ground_m']**2 for p in pairs)/len(pairs)),'scope':'Two centroid-based paired feature separations. R55/IS11 uses a south control; not a two-point independent south accuracy result. No whole-seam or full-shoreline acceptance.'}
if __name__=='__main__':print(json.dumps(calculate(),indent=2))
