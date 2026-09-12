"""Render four final full-sheet drafts with existing exact GDAL renderer."""
import csv, json, subprocess, sys
from pathlib import Path
import work as w
OUT=w.DL/'fletcher-route19-three-rounds-20260912'
for s,conf in w.CONFIG.items():
    folder=w.HERE/f'sheet-{s}';fitpath=folder/'round-3-fit.json';fit=w.read(fitpath);checks=w.read(folder/'checks.json');checks['fit_sha256']=w.c.digest(fitpath)
    w.write(folder/'render-checks.json',checks)
    for name,points in [('controls',[p for p in fit['points'] if p['role']=='control']),('review',[p for p in fit['points'] if p['role']=='control']+checks['points'])]:
        with (folder/f'sheet-{s}-{name}.csv').open('w') as f:
            out=csv.writer(f,lineterminator="\n");out.writerow(['pixel_x','pixel_y','lon','lat','role','label'])
            for p in points:out.writerow([*p['pixel_xy'],*p['lonlat'],p['role'],p['id']])
    target=OUT/f'sheet-{s}';target.mkdir(parents=True,exist_ok=True)
    print('Rendering',s,flush=True)
    log=target/'render.log'
    with log.open('w') as f:
        subprocess.run([sys.executable,str(w.ROOT/'full-sheets/render.py'),'--source',str(w.DL/conf['source']),'--fit',str(fitpath),'--checks',str(folder/'render-checks.json'),'--boundary',str(w.ROOT/conf['boundary']),'--out',str(target)],stdout=f,stderr=subprocess.STDOUT,check=True)
    w.write(folder/'raster-receipt.json',w.read(target/'scores.json'))
    print('Rendered',s,flush=True)
