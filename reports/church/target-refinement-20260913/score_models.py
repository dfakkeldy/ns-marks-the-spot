"""Use supported production GDAL model arguments with the frozen review metric convention."""
import math,subprocess
import numpy as np
from tools.church.cutline_warp import transform_arguments
from tools.church.georeference import build_gcp_arguments
from tools.church.geometry import mercator_to_lonlat

def score(controls,checks,method):
 assert not {(p.lon,p.lat) for p in controls}&{(p.lon,p.lat) for p in checks}
 output=subprocess.check_output(['gdaltransform',*transform_arguments(method),*build_gcp_arguments(controls)],input=''.join(f'{p.pixel_x} {p.pixel_y}\n' for p in checks),text=True)
 rows=[]
 for p,line in zip(checks,output.splitlines(),strict=True):
  lon,lat=mercator_to_lonlat(*map(float,line.split()[:2]));e=6371008.8*math.radians(lon-p.lon)*math.cos(math.radians((lat+p.lat)/2));n=6371008.8*math.radians(lat-p.lat);rows.append(dict(label=p.label,east_ground_m=e,north_ground_m=n,error_ground_m=math.hypot(e,n)))
 errors=np.array([p['error_ground_m'] for p in rows]);en=np.array([[p['east_ground_m'],p['north_ground_m']] for p in rows]);return dict(count=len(rows),points=rows,rms_ground_m=float(np.sqrt(np.mean(errors**2))),median_ground_m=float(np.median(errors)),p95_ground_m=float(np.percentile(errors,95)),max_ground_m=float(errors.max()),mean_east_ground_m=float(en[:,0].mean()),mean_north_ground_m=float(en[:,1].mean()),scatter_rms_ground_m=float(np.sqrt(np.mean(np.sum((en-en.mean(axis=0))**2,axis=1)))),distance='Equirectangular horizontal ground distance, mean latitude cosine, sphere radius 6371008.8 m; warped minus reference',percentile='NumPy linear empirical 95th percentile; not a confidence interval')
