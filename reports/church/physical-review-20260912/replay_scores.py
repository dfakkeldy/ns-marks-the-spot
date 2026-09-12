"""Replay frozen diagnostic coordinates with GDAL; no source imagery required.

PYTHONPATH=. python reports/church/physical-review-20260912/replay_scores.py
"""
import hashlib
import json
import math
import subprocess
from pathlib import Path
from tools.church.gcps import load_gcps
from tools.church.geometry import mercator_to_lonlat

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]

def score(controls, checks, transform):
    args=[]
    for p in controls:
        assert p.role=='control'
        args += ['-gcp',str(p.pixel_x),str(p.pixel_y),*map(str,p.mercator)]
    assert all(p.role=='check' for p in checks)
    assert not {(p.lon,p.lat) for p in controls} & {(p.lon,p.lat) for p in checks}
    opts=['-order','1'] if transform=='affine' else ['-tps']
    text=subprocess.check_output(['gdaltransform',*opts,*args],input=''.join(f'{p.pixel_x} {p.pixel_y}\n' for p in checks),text=True)
    rows=[]
    for p,line in zip(checks,text.splitlines(),strict=True):
        lon,lat=mercator_to_lonlat(*map(float,line.split()[:2]))
        error=6371008.8*math.hypot(math.radians(lon-p.lon)*math.cos(math.radians((lat+p.lat)/2)),math.radians(lat-p.lat))
        rows.append({'label':p.label,'error_ground_m':error})
    return {'points':rows,'rms_ground_m':math.sqrt(sum(p['error_ground_m']**2 for p in rows)/len(rows)),'max_ground_m':max(p['error_ground_m'] for p in rows)}

def main():
    north_controls=load_gcps(REPO/'tools/church/gcps/inverness-north.csv')
    north_checks=load_gcps(HERE/'north-diagnostic-checks.csv')
    richmond=load_gcps(HERE/'richmond/physical-draft.csv')
    richmond_controls=[p for p in richmond if p.role=='control'];richmond_checks=[p for p in richmond if p.role=='check']
    baseline=load_gcps(REPO/'tools/church/gcps/richmond-main.csv')
    output={'distance':'equirectangular ground distance; mean latitude cosine; radius 6371008.8 m','geographic_acceptance':False,'north':{},'richmond_same_four_diagnostics':{}}
    for transform in ['affine','tps']:
        output['north'][transform]=score(north_controls,north_checks,transform)
        output['richmond_same_four_diagnostics'][transform]={'graticule_baseline':score(baseline,richmond_checks,transform),'physical_draft':score(richmond_controls,richmond_checks,transform)}
    expected=json.loads((HERE/'richmond/physical-draft-scores.json').read_text())
    for transform in ['affine','tps']:
        assert abs(output['richmond_same_four_diagnostics'][transform]['physical_draft']['rms_ground_m']-expected['models'][transform]['rms_ground_m'])<0.01
    output['input_hashes']={str(p.relative_to(REPO)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [REPO/'tools/church/gcps/inverness-north.csv',REPO/'tools/church/gcps/richmond-main.csv',HERE/'north-diagnostic-checks.csv',HERE/'richmond/physical-draft.csv']}
    (HERE/'replayed-scores.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({k:{model:values for model,values in v.items()} for k,v in output.items() if k in ['richmond_same_four_diagnostics']},indent=2))

if __name__=='__main__':main()
