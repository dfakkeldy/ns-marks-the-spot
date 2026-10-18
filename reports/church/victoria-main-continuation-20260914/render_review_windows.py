"""Compare actual selected raster pixels with original reference geometry."""
import hashlib,json,math,subprocess
from pathlib import Path
import numpy as np
from osgeo import gdal
from PIL import Image,ImageDraw
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.geometry import lonlat_to_mercator
H=Path(__file__).resolve().parent
C=Path('/Users/dfakkeldy/Downloads/church-victoria-main-continuation-20260914')
R=C/'corrected-tps14-rendered/victoria-main-corrected-tps14-review-20m.tif'
receipt=json.loads((H/'reference-correction/artifact-receipt.json').read_text())
assert hashlib.sha256(R.read_bytes()).hexdigest()==receipt['output_sha256']
cs=load_gcps(H/'reference-correction/controls.csv');control_ids={p.label for p in cs}
obs={p['id']:p for p in json.loads((H.parent/'physical-review-20260913/victoria-main/observations.json').read_text())['points']}
obs.update({p['id']:p for p in json.loads((H.parent/'distributed-review-20260913/victoria-main/observations.json').read_text())['points']})
for p in (H/'observations').glob('VM*.json'):
 o=json.loads(p.read_text());obs[o['id']]=o
obs.pop('VM12')
points=[obs[k] for k in sorted(obs)]
refs=[Path('/Users/dfakkeldy/Downloads')/f'fletcher-sheet{n:02}/reference-full/water-lines.geojson' for n in [7,10,12,15]]+[Path('/Users/dfakkeldy/Downloads/church-review-20260913')/name for name in ['cape-water-lines.geojson','bird-water-lines.geojson']]
fs={}
for path in refs:
 for f in json.loads(path.read_text())['features']:
  if f['id'] in fs:assert fs[f['id']]['geometry']==f['geometry'],f['id']
  fs[f['id']]=f
lines=[]
for f in fs.values():
 v=np.array([lonlat_to_mercator(*p) for p in f['geometry']['coordinates']]);lines.append((v,v.min(axis=0),v.max(axis=0)))
gdal.UseExceptions();ds=gdal.Open(str(R));inverse=gdal.InvGeoTransform(ds.GetGeoTransform());out=H/'warped-review';out.mkdir(exist_ok=True)
raw=subprocess.check_output(['gdaltransform','-tps',*build_gcp_arguments(cs)],input=''.join(f"{p['pixel_xy'][0]} {p['pixel_xy'][1]}\n" for p in points),text=True);preds=[list(map(float,x.split()[:2])) for x in raw.splitlines()];reviews=[]
for p,pred in zip(points,preds,strict=True):
 lon,lat=p['lonlat'];x,y=lonlat_to_mercator(lon,lat);half=1000/math.cos(math.radians(lat));bounds=[x-half,y-half,x+half,y+half]
 view=gdal.Warp('',ds,format='MEM',outputBounds=bounds,width=1000,height=1000,resampleAlg='bilinear',dstAlpha=True);im=Image.new('RGBA',(1000,1040),'#efefea');im.alpha_composite(Image.fromarray(np.moveaxis(view.ReadAsArray(),0,2)));d=ImageDraw.Draw(im)
 def px(v):return ((v[0]-bounds[0])/(2*half)*1000,(bounds[3]-v[1])/(2*half)*1000)
 for v,lo,hi in lines:
  if hi[0]>=bounds[0] and lo[0]<=bounds[2] and hi[1]>=bounds[1] and lo[1]<=bounds[3]:d.line([px(q) for q in v],fill='#0077aa',width=2)
 ax,ay=px(pred);d.line((ax-13,ay-13,ax+13,ay+13),fill='#d66c00',width=3);d.line((ax-13,ay+13,ax+13,ay-13),fill='#d66c00',width=3);d.line((482,500,518,500),fill='red',width=3);d.line((500,482,500,518),fill='red',width=3)
 role='CONTROL - not validation' if p['id'] in control_ids else 'fresh after corrected TPS14 freeze' if p['id'] in ['VM29'] else 'selection diagnostic'
 d.rectangle((0,1000,1000,1040),fill='#fffdf5');d.text((10,1007),f"{p['id']} - {role} - actual corrected TPS14 / original NSTDB - 2000 ground-metre window",fill='black');d.text((10,1023),'Orange: warped source. Red: reference. Rumsey / Stanford - CC BY-NC-SA 3.0.',fill='black');dest=out/f"{p['id']}.jpg";im.convert('RGB').save(dest,quality=92)
 col,row=gdal.ApplyGeoTransform(inverse,*pred);alpha=int(ds.GetRasterBand(4).ReadAsArray(int(col),int(row),1,1)[0,0]);assert alpha>0
 reviews.append(dict(id=p['id'],role=role,figure=dest.name,figure_sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),source_pixel_alpha=alpha))
(out/'receipt.json').write_text(json.dumps(dict(raster_sha256=receipt['output_sha256'],reviews=reviews,references=[dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in refs],geographic_acceptance=False),indent=2)+'\n')
for offset in range(0,len(reviews),4):
 contact=Image.new('RGB',(1000,1040),'white')
 for i,r in enumerate(reviews[offset:offset+4]):
  picture=Image.open(out/r['figure']);picture.thumbnail((500,520));contact.paste(picture,((i%2)*500,(i//2)*520))
 contact.save(out/f'contact-{offset//4+1}.jpg',quality=93)
print('Rendered',len(reviews),'actual windows')
