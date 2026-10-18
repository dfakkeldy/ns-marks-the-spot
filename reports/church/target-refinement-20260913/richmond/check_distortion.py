"""Finite-grid derivative audit over the exact expanded Richmond content boundary."""
import json,subprocess,sys
from pathlib import Path
import numpy as np
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.cutline_warp import transform_arguments
from tools.church.cutlines import Cutline
HERE=Path(__file__).resolve().parent;REPORTS=HERE.parents[1]
ring=json.loads((REPORTS/'physical-review-20260912/richmond/content-boundary.json').read_text())['ring_pixel_xy'];poly=Cutline(tuple(map(tuple,ring)))
def audit(csv,method):
 cs=[p for p in load_gcps(csv) if p.role=='control'];samples=[(x,y) for y in np.arange(min(p[1] for p in ring),max(p[1] for p in ring),200) for x in np.arange(min(p[0] for p in ring),max(p[0] for p in ring),200) if poly.contains(x,y)]
 for p in cs:samples.extend((x,y) for y in np.arange(p.pixel_y-500,p.pixel_y+501,25) for x in np.arange(p.pixel_x-500,p.pixel_x+501,25) if poly.contains(x,y))
 s=np.array(samples);data=np.vstack([s,s+[1,0],s+[0,1]]);output=subprocess.check_output(['gdaltransform',*transform_arguments(method),*build_gcp_arguments(cs)],input=''.join(f'{x} {y}\n' for x,y in data),text=True);b,x,y=np.split(np.array([list(map(float,l.split()[:2])) for l in output.splitlines()]),3);dx=x-b;dy=y-b;det=dx[:,0]*dy[:,1]-dx[:,1]*dy[:,0];mat=np.stack([dx,dy],axis=2);sv=np.linalg.svd(mat,compute_uv=False);ratio=sv[:,0]/sv[:,1]
 return dict(method=method,control_count=len(cs),samples=len(s),nonnegative_determinants=int((det>=0).sum()),determinant_range=[float(det.min()),float(det.max())],anisotropy_median=float(np.median(ratio)),anisotropy_p95=float(np.percentile(ratio,95)),anisotropy_max=float(ratio.max()),singular_value_range_projected_m_per_native_px=[float(sv.min()),float(sv.max())],worst_anisotropy_source_xy=s[int(ratio.argmax())].tolist(),limitation='Finite samples over full content and near controls, not a continuous-surface fold proof or geographic validation')
j={name:audit(path,method) for name,path,method in [('v4',REPORTS/'physical-review-20260912/richmond/refinement-04/frozen-fit.csv','tps'),('single-R26',HERE/'promote-R26.csv','tps'),('distributed14',HERE/'distributed-14-tps.csv','tps')]};(HERE/'distortion-comparison.json').write_text(json.dumps(j,indent=2)+'\n');print(json.dumps(j,indent=2))
