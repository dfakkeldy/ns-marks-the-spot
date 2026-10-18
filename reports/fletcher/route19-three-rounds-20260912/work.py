"""Frozen Route 19 audit mechanics; correspondence decisions remain manual."""
import argparse, csv, hashlib, importlib.util, json, math
from pathlib import Path
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
DL=Path.home()/'Downloads'
spec=importlib.util.spec_from_file_location('core',ROOT/'judique-boundary/build_boundary.py')
c=importlib.util.module_from_spec(spec); spec.loader.exec_module(c)
CONFIG={
'14':dict(fit='sheet14/southern-audit-20260909/hay-topology/fit.json',checks=['sheet14/southern-audit-20260909/hay-topology/checks.json'],source='fletcher-sheet14/native/sheet14.png',reference='fletcher-sheet14/reference',boundary='sheet14/boundary.json'),
'16':dict(fit='mabou-full-sheet/north-audit-20260909/candidate36/fit.json',checks=['mabou-full-sheet/north-audit-20260909/candidate36/checks.json'],source='fletcher-sheet16/native/sheet16.png',reference='fletcher-sheet16/reference',boundary='sheet16/boundary.json'),
'19':dict(fit='judique-full-sheet/revised-fit.json',checks=['judique-boundary/additional-checks.json','judique-full-sheet/lake-checks.json','judique-full-sheet/fresh-checks.json','visual-expansion/sheet-observations.json'],source='fletcher-extraction-pilot/native-sheet19/sheet19.png',reference='fletcher-matching-benchmark',boundary='judique-boundary/boundary.json'),
'22':dict(fit='hawkesbury-full-sheet/boundary-fit.json',checks=['hawkesbury-full-sheet/boundary-diagnostic-checks.json'],source='fletcher-sheet22/native/sheet22.png',reference='fletcher-sheet22/reference',boundary='sheet22/boundary.json')}
def read(p): return json.loads(Path(p).read_text())
def write(p,v): Path(p).parent.mkdir(parents=True,exist_ok=True);c.write(Path(p),v)
def transform(fit,xy):
    controls=[p for p in fit['points'] if p['role']=='control'];args=[]
    for p,w in zip(controls,c.merc([p['lonlat'] for p in controls])): args+=['-gcp',*map(str,[*p['pixel_xy'],*w])]
    return np.array([list(map(float,row.split()[:2])) for row in c.run('gdaltransform','-tps',*args,stdin=''.join(f'{x} {y}\n' for x,y in xy)).splitlines()])
def score(fitpath,checkpath,out):
    fit=read(fitpath);checks=read(checkpath)['points'];controls=[p for p in fit['points'] if p['role']=='control']
    for field in ['pixel_xy','lonlat']:
        assert not {tuple(p[field]) for p in checks}&{tuple(p[field]) for p in controls}
    assert all(p['role']=='check' for p in checks)
    pred=c.unmerc(transform(fit,[p['pixel_xy'] for p in checks])); actual=np.array([p['lonlat'] for p in checks])
    err=6371008.8*np.hypot(np.deg2rad(pred[:,0]-actual[:,0])*np.cos(np.deg2rad((pred[:,1]+actual[:,1])/2)),np.deg2rad(pred[:,1]-actual[:,1]))
    result=dict(fit_sha256=c.digest(Path(fitpath)),checks_sha256=c.digest(Path(checkpath)),control_count=len(controls),check_count=len(checks),rms_ground_m=float(np.sqrt(np.mean(err**2))),median_ground_m=float(np.median(err)),worst_ground_m=float(max(err)),method='GDAL TPS EPSG:3857; approximate spherical ground metres',status='Frozen excluded diagnostics, reused during selection; not fresh validation',points=[dict(id=p['id'],error_ground_m=float(e),predicted_lonlat=ll.tolist()) for p,e,ll in zip(checks,err,pred)])
    write(out,result);return result

def init():
    ranking=[]
    for s,conf in CONFIG.items():
        out=HERE/f'sheet-{s}';out.mkdir(exist_ok=True);fit=read(ROOT/conf['fit']); c.verified(DL/conf['source'],fit['source_sha256'])
        checks=[]
        for path in conf['checks']:
            checks.extend(p for p in read(ROOT/path)['points'] if p['role']=='check')
        if s=='19':
            ids={p['id'] for p in read(ROOT/'full-sheets/judique-render-receipt.json')['points']}|{'E01','E02','E03'}
            checks=[p for p in checks if p['id'] in ids]
            assert len(checks)==20
        assert len({p['id'] for p in checks})==len(checks)
        write(out/'baseline-fit.json',fit);write(out/'checks.json',dict(points=checks,status='Frozen same-coordinate diagnostics for all three rounds. None may become fitting controls.',sources=conf['checks']))
        r=score(out/'baseline-fit.json',out/'checks.json',out/'baseline-scores.json');ranking.append(dict(sheet=s,rms_ground_m=r['rms_ground_m'],checks=len(checks)))
        conf['source_dimensions']=fit['source_dimensions']; conf['baseline_fit_sha256']=c.digest(ROOT/conf['fit']); conf['boundary_sha256']=c.digest(ROOT/conf['boundary']); conf['source_sha256']=c.digest(DL/conf['source']); conf['reference_hashes']={k:c.digest(DL/conf['reference']/f'{k}.geojson') for k in ['water-lines','roads']}
    write(HERE/'inputs.json',dict(baseline_commit='ad44f1821f1cf4b6dba201e8ba805391f3303f95',sheets=CONFIG,metric='RMS on frozen excluded check coordinates; ground metres',rounds=3))
    write(HERE/'round-1-order.json',sorted(ranking,key=lambda r:-r['rms_ground_m']));print(json.dumps(sorted(ranking,key=lambda r:-r['rms_ground_m']),indent=2))

def review(s,fitpath,ids,out,half=160,modern=650):
    conf=CONFIG[s];data=read(fitpath);pts=[p for p in data['points'] if p['id'] in ids];assert len(pts)==len(ids)
    im=Image.open(DL/conf['source']);vectors={}
    for layer in ['water-lines','roads']:
        vectors[layer]=[]
        for f in read(DL/conf['reference']/f'{layer}.geojson')['features']:
            g=f['geometry'];parts=[g['coordinates']] if g['type']=='LineString' else g['coordinates']; vectors[layer].extend(np.array(a)[:,:2] for a in parts)
    out=Path(out);out.mkdir(parents=True,exist_ok=True);frames=[]
    for p in pts:
        x,y=p['pixel_xy'];lon,lat=p['lonlat'];box=(int(x)-half,int(y)-half,int(x)+half,int(y)+half)
        fig,ax=plt.subplots(1,2,figsize=(12,6));ax[0].imshow(im.crop(box),extent=(box[0],box[2],box[3],box[1]));ax[0].plot(x,y,'+',color='red',ms=16,mew=1);ax[0].grid(alpha=.15);ax[0].set_title(f'Native {p["id"]}: {x}, {y}')
        scale=np.array([111195*np.cos(np.deg2rad(lat)),111195])
        for layer,col in [('roads','#aaaaaa'),('water-lines','#0079ae')]:
            lines=[(a-[lon,lat])*scale for a in vectors[layer]];lines=[a for a in lines if np.all(a.min(axis=0)<modern) and np.all(a.max(axis=0)>-modern)]
            ax[1].add_collection(LineCollection(lines,colors=col,linewidths=1.2))
        ax[1].plot(0,0,'+',color='red',ms=16,mew=1);ax[1].set(xlim=(-modern,modern),ylim=(-modern,modern),aspect='equal',title='NSTDB water / modern roads · ground m');ax[1].grid(alpha=.15)
        fig.suptitle(f'Sheet {s} · {p["id"]} · {p["role"]}');fig.tight_layout();name=f'{p["id"]}.jpg';fig.savefig(out/name,dpi=130);plt.close(fig)
        frames.append(dict(image=name,record=str(Path(fitpath).resolve().relative_to(ROOT)),record_sha256=c.digest(Path(fitpath)),id=p['id'],native_box=box,pixel_xy=p['pixel_xy'],lonlat=p['lonlat'],rotation=0,native_image_edge_coordinates=True,modern_half_ground_m=modern))
    write(out/'frames.json',frames)
if __name__=='__main__':
    ap=argparse.ArgumentParser();sp=ap.add_subparsers(dest='command');sp.add_parser('init');p=sp.add_parser('review');p.add_argument('sheet');p.add_argument('record');p.add_argument('ids');p.add_argument('out');p.add_argument('--half',type=int,default=160);p.add_argument('--modern',type=int,default=650)
    p=sp.add_parser('score');p.add_argument('fit');p.add_argument('checks');p.add_argument('out');a=ap.parse_args()
    if a.command=='init':init()
    elif a.command=='review':review(a.sheet,Path(a.record),a.ids.split(','),a.out,a.half,a.modern)
    elif a.command=='score':print(json.dumps(score(a.fit,a.checks,a.out),indent=2))

def finish_pass(s,round_number,note,proposal=None):
    folder=HERE/f'sheet-{s}';base=folder/('baseline-fit.json' if round_number==1 else f'round-{round_number-1}-fit.json');fit=read(base)
    before=score(base,folder/'checks.json',folder/f'round-{round_number}-before.json')
    accepted=False;trial=None
    if proposal:
        additions=read(folder/proposal)['points']
        replace={p['id']:p for p in additions};assert not any(k.startswith('gcp-') for k in replace)
        existing={p['id'] for p in fit['points']}
        fit['points']=[replace.get(p['id'],p) for p in fit['points']]+[p for p in additions if p['id'] not in existing]
        fit['parent_fit_sha256']=c.digest(base)
        fit['round19_audit']='2026-09-12: same-agent diagnostics; source, boundary and existing controls retained'
        if isinstance(fit.get('fit'),dict):fit['fit']['control_count']=sum(p['role']=='control' for p in fit['points'])
        trialpath=folder/f'round-{round_number}-trial-fit.json';write(trialpath,fit)
        trial=score(trialpath,folder/'checks.json',folder/f'round-{round_number}-trial-scores.json')
        accepted=trial['rms_ground_m']<before['rms_ground_m'] and trial['worst_ground_m']<=before['worst_ground_m']+10
    final=fit if accepted else read(base);write(folder/f'round-{round_number}-fit.json',final)
    after=score(folder/f'round-{round_number}-fit.json',folder/'checks.json',folder/f'round-{round_number}-scores.json')
    decision=dict(sheet=s,round=round_number,before_rms_ground_m=before['rms_ground_m'],after_rms_ground_m=after['rms_ground_m'],proposal=proposal,accepted_pending_render=accepted,note=note,trial_rms_ground_m=trial['rms_ground_m'] if trial else None,criteria='Evidence-reviewed correspondence; lower same-check RMS and no >10 ground-m increase in worst diagnostic; subsequently require sampled orientation, raster and importer verification.')
    write(folder/f'round-{round_number}-decision.json',decision);print(json.dumps(decision,indent=2))

def nearby_nodes(s,pid,box):
    from collections import defaultdict
    p=next(p for p in read(HERE/f'sheet-{s}/baseline-fit.json')['points'] if p['id']==pid);nodes=defaultdict(list)
    for f in read(DL/CONFIG[s]['reference']/'water-lines.geojson')['features']:
        g=f['geometry'];parts=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
        for a in parts:
            for xy in [a[0],a[-1]]:nodes[tuple(xy[:2])].append(f['properties'])
    result=[]
    for ll,ids in nodes.items():
        xy=(np.array(ll)-p['lonlat'])*[111195*np.cos(np.deg2rad(p['lonlat'][1])),111195]
        if len(ids)>=3 and box[0]<xy[0]<box[2] and box[1]<xy[1]<box[3]:result.append(dict(lonlat=list(ll),offset_m=xy.tolist(),features=ids))
    print(json.dumps(result,indent=2));return result
