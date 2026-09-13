"""Freeze the Blue Lake repair against the six existing diagnostics."""
import csv,json,hashlib,importlib.util
from pathlib import Path
from tools.church.gcps import load_gcps,GroundControlPoint
HERE=Path(__file__).resolve().parent;BASE=HERE.parent/'refinement-01'
spec=importlib.util.spec_from_file_location('replay',HERE.parent.parent/'replay_scores.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
old=load_gcps(BASE/'richmond-refined.csv');c=[p for p in old if p.role=='control'];q=[p for p in old if p.role=='check'];obs=json.loads((HERE/'control-observation.json').read_text());new=c+[GroundControlPoint(*obs['pixel_xy'],*obs['lonlat'],'control',obs['id'])]
res={'baseline_csv_sha256':hashlib.sha256((BASE/'richmond-refined.csv').read_bytes()).hexdigest(),'new_control_sha256':hashlib.sha256((HERE/'control-observation.json').read_bytes()).hexdigest(),'check_status':'Same six diagnostic coordinates; no check moved or fitted. Fresh check identities are selected only after this fit is frozen.','models':{}}
for name,cs,method in [('baseline-six-tps',c,'tps'),('seven-affine',new,'affine'),('seven-tps',new,'tps')]:res['models'][name]=r.score(cs,q,method)
with (HERE/'frozen-fit.csv').open('w',newline='') as f:
 w=csv.writer(f,lineterminator='\n');w.writerow(['pixel_x','pixel_y','lon','lat','role','label'])
 for p in new+q:w.writerow([p.pixel_x,p.pixel_y,p.lon,p.lat,p.role,p.label])
res['frozen_fit_csv_sha256']=hashlib.sha256((HERE/'frozen-fit.csv').read_bytes()).hexdigest();assert res['models']['seven-tps']['rms_ground_m'] < res['models']['baseline-six-tps']['rms_ground_m']
res['selected_model']='tps';res['geographic_acceptance']=False
(HERE/'repair-diagnostics.json').write_text(json.dumps(res,indent=2)+'\n');print(json.dumps(res,indent=2))
