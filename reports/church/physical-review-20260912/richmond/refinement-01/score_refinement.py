"""Compare a frozen physical refinement on unchanged and expanded diagnostics."""
import json,csv,hashlib,importlib.util,math
from dataclasses import replace
from pathlib import Path
from tools.church.gcps import load_gcps,GroundControlPoint
HERE=Path(__file__).resolve().parent; BASE=HERE.parent
spec=importlib.util.spec_from_file_location('replay',BASE.parent/'replay_scores.py');replay=importlib.util.module_from_spec(spec);spec.loader.exec_module(replay)
old=load_gcps(BASE/'physical-draft.csv');controls=[p for p in old if p.role=='control'];checks=[p for p in old if p.role=='check'];blake=load_gcps(BASE/'blake-diagnostic-check.csv')
new=json.loads((HERE/'new-observations.json').read_text())['points'];newpoints=[GroundControlPoint(*p['pixel_xy'],*p['lonlat'],p['role'],p['id']) for p in new]
newcontrols=controls+[p for p in newpoints if p.role=='control'];newchecks=[p for p in newpoints if p.role=='check'];allchecks=checks+blake+newchecks
result={'source_sha256':'462194ca1ca810d88416d7cd344f17c5f37acf20c8e43381dc3064668010a5f7','baseline_csv_sha256':hashlib.sha256((BASE/'physical-draft.csv').read_bytes()).hexdigest(),'new_observations_sha256':hashlib.sha256((HERE/'new-observations.json').read_bytes()).hexdigest(),'control_count':len(newcontrols),'check_count':len(allchecks),'fresh_validation_count':0,'check_status':'Diagnostic: original checks replayed during refinement; Blake corrected after initial fit; D01 chosen after seeing the northern mismatch. No checks enter fitting.','geographic_acceptance':False,'models':{}}
for name,cs,method in [('baseline-affine',controls,'affine'),('baseline-tps',controls,'tps'),('refined-affine',newcontrols,'affine'),('refined-tps',newcontrols,'tps')]:
 result['models'][name]={'same_four':replay.score(cs,checks,method),'same_five_including_blake':replay.score(cs,checks+blake,method),'all_six_diagnostics':replay.score(cs,allchecks,method)}
with (HERE/'richmond-refined.csv').open('w',newline='') as f:
 writer=csv.writer(f,lineterminator='\n');writer.writerow(['pixel_x','pixel_y','lon','lat','role','label'])
 for p in newcontrols+allchecks:writer.writerow([p.pixel_x,p.pixel_y,p.lon,p.lat,p.role,p.label])
(HERE/'trial-01.json').write_text(json.dumps(result,indent=2)+'\n')
for name,r in result['models'].items():print(name,{group:{k:round(v,2) for k,v in s.items() if k!='points'} for group,s in r.items()})

# Evaluate the pre-recorded C02 uncertainty; never choose an offset for the fit.
uncertainty=next(p['placement_uncertainty_ground_m'] for p in new if p['id']=='C02')
tests=[]
for direction,east,north in [('east',uncertainty,0),('west',-uncertainty,0),('north',0,uncertainty),('south',0,-uncertainty)]:
    shifted=[replace(p,lon=p.lon+east/(111195*math.cos(math.radians(p.lat))),lat=p.lat+north/111195) if p.label=='C02' else p for p in newcontrols]
    scored=replay.score(shifted,checks,'tps')
    tests.append(dict(direction=direction,offset_ground_m=[east,north],same_four_rms_ground_m=scored['rms_ground_m'],same_four_max_ground_m=scored['max_ground_m']))
sensitivity=dict(scope='Sensitivity to C02 pre-recorded 90 m placement uncertainty. No perturbed position selected or written into the fit. Original observation remains unchanged.',tests=tests,rms_range=[min(p['same_four_rms_ground_m'] for p in tests),max(p['same_four_rms_ground_m'] for p in tests)])
(HERE/'C02-sensitivity.json').write_text(json.dumps(sensitivity,indent=2)+'\n')
