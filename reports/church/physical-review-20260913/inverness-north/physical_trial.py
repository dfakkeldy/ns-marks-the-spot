"""Bounded physical-control trial; existing graticule/failed checks preserved."""
import sys,json,hashlib
from pathlib import Path
from dataclasses import replace
from PIL import Image,ImageDraw
from tools.church.gcps import GroundControlPoint as GCP,load_gcps
ROOT=Path(__file__).resolve().parents[1];HERE=Path(__file__).resolve().parent;OLD=ROOT.parent/'physical-review-20260912';CACHE=Path('/Users/dfakkeldy/Downloads/church-review-20260913')
sys.path.insert(0,str(OLD/'richmond/refinement-03'))
from freeze_western_repair import score,write_csv,digest
prior=json.loads((OLD/'north-diagnostic-observations.json').read_text());obs=[]
for p in prior['points']:
 q=dict(p);q['role']='control' if p['id'] in ['N02','N04'] else 'check';q['status']='promoted unchanged from preserved failed diagnostic' if q['role']=='control' else 'retained migratory-estuary diagnostic, not used for fit';obs.append(q)
e=next(v for v in json.loads((CACHE/'I10-reference.json').read_text())['endpoints'] if v['index']==4)
refs=json.loads(Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson').read_text())['features'];f=next(f for f in refs if f['id']==3808);k=min(range(len(f['geometry']['coordinates'])),key=lambda i:f['geometry']['coordinates'][i][1]);tip=f['geometry']['coordinates'][k]
for name,xy,ll,fid,vertex,evidence,definition,uncertainty in [('I10',[7347,25733],e['lonlat'],e['feature_id'],e['vertex'],'First Fork east tributary entering Northeast Margaree River; distinct upstream bend/Second Fork, northward main branch, eastern branch and downstream meanders traced in broad and native views. Modern bank segment explicitly names First Brook Pool.','Northern bank apex between northward main channel and incoming eastern First Fork branch',180),('I11',[2858,20168],tip,3808,k,'Southern rounded lobe of Cheticamp Island, below the labelled light and west of the harbour; traced broad island/harbour context and native coastline. Modern extremum is restricted to the physically identified tip arc, not a box cut through a trending coast.','Southernmost coastline on the distinct terminal lobe; broad historical tip carries along-shore uncertainty',130)]:
 fr=json.loads((CACHE/(name+'-frame.json')).read_text());im=Image.open(CACHE/(name+'.jpg'));d=ImageDraw.Draw(im);sx,sy=[xy[i]-fr['origin'][i] for i in range(2)];d.line((sx-25,sy,sx+25,sy),fill='red',width=3);d.line((sx,sy-25,sx,sy+25),fill='red',width=3);im.save(HERE/(name+'-native-review.jpg'),quality=92)
 obs.append(dict(id=name,pixel_xy=xy,lonlat=ll,role='control',feature_id=fid,vertex=vertex,source_frame=fr,source_crop_sha256=digest(CACHE/(name+'.jpg')),feature_definition=definition,identity_evidence=evidence,uncertainty_ground_m=uncertainty))
(HERE/'observations.json').write_text(json.dumps(dict(source_sha256=prior['source_sha256'],source_dimensions=prior['source_dimensions'],points=obs),indent=2)+'\n')
points=[GCP(*p['pixel_xy'],*p['lonlat'],p['role'],p['id']) for p in obs];write_csv(HERE/'physical-trial.csv',points)
cs=[p for p in points if p.role=='control'];checks=[p for p in points if p.role=='check'];baseline=[p for p in load_gcps(Path('tools/church/gcps/inverness-north.csv')) if p.role=='control']
r=dict(control_count=4,check_count=1,check_status='One diagnostic migrating estuary; insufficient independent panel-wide checks',models={name:score(c,checks,method) for name,c,method in [('graticule-tps',baseline,'tps'),('physical-affine',cs,'affine'),('physical-tps',cs,'tps')]},geographic_acceptance=False)
(HERE/'trial-scores.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
