"""Inspect actual TPS11 pixels against original water geometry at measured features."""
import json,hashlib,math,subprocess
from pathlib import Path
import numpy as np
from osgeo import gdal
from PIL import Image,ImageDraw
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.geometry import lonlat_to_mercator
HERE=Path(__file__).resolve().parent
CACHE=Path('/Users/dfakkeldy/Downloads/church-victoria-nw-continuation-20260914')
RASTER=CACHE/'tps11-rendered/victoria-northwest-tps11-review-20m.tif'
receipt=json.loads((CACHE/'tps11-rendered/artifact-receipt.json').read_text());assert hashlib.sha256(RASTER.read_bytes()).hexdigest()==receipt['output_sha256']
cs=load_gcps(HERE/'north-pond-support/controls.csv');control_ids={p.label for p in cs};obs={p['id']:p for p in json.loads((HERE/'north-pond-audit/observations.json').read_text())['points']}
for f in (HERE/'observations').glob('VN*.json'):
 p=json.loads(f.read_text());obs[p['id']]=p
ids=['VN11','VN15','VN16','VN17','VN18','VN19','VN20','VN21','VN22'];points=[obs[id] for id in ids]
refs=[Path('/Users/dfakkeldy/Downloads')/f'fletcher-sheet{n:02}/reference-full/water-lines.geojson' for n in [1,2,4,5]];fs={}
for p in refs:
 for f in json.loads(p.read_text())['features']:
  if f['id'] in fs:assert fs[f['id']]['geometry']==f['geometry']
  fs[f['id']]=f
lines=[]
for f in fs.values():
 v=np.array([lonlat_to_mercator(*q) for q in f['geometry']['coordinates']]);lines.append((v,v.min(axis=0),v.max(axis=0)))
gdal.UseExceptions();ds=gdal.Open(str(RASTER));inverse=gdal.InvGeoTransform(ds.GetGeoTransform());out=HERE/'tps11-warped-review';out.mkdir(exist_ok=True)
values=subprocess.check_output(['gdaltransform','-tps',*build_gcp_arguments(cs)],input=''.join(f"{p['pixel_xy'][0]} {p['pixel_xy'][1]}\n" for p in points),text=True);predictions=[list(map(float,l.split()[:2])) for l in values.splitlines()];reviews=[]
for p,pred in zip(points,predictions):
 lon,lat=p['lonlat'];x,y=lonlat_to_mercator(lon,lat);half=1000/math.cos(math.radians(lat));b=[x-half,y-half,x+half,y+half]
 view=gdal.Warp('',ds,format='MEM',outputBounds=b,width=1000,height=1000,resampleAlg='bilinear',dstAlpha=True);im=Image.new('RGBA',(1000,1040),'#efefea');im.alpha_composite(Image.fromarray(np.moveaxis(view.ReadAsArray(),0,2)));d=ImageDraw.Draw(im)
 def px(v):return ((v[0]-b[0])/(2*half)*1000,(b[3]-v[1])/(2*half)*1000)
 for v,lo,hi in lines:
  if hi[0]>=b[0] and lo[0]<=b[2] and hi[1]>=b[1] and lo[1]<=b[3]:d.line([px(q) for q in v],fill='#0077aa',width=2)
 ax,ay=px(pred);d.line((ax-13,ay-13,ax+13,ay+13),fill='#d66c00',width=3);d.line((ax-13,ay+13,ax+13,ay-13),fill='#d66c00',width=3);d.line((482,500,518,500),fill='red',width=3);d.line((500,482,500,518),fill='red',width=3)
 role='CONTROL - not validation' if p['id'] in control_ids else 'fresh at TPS11 freeze' if p['id'] in ['VN20','VN21','VN22'] else 'diagnostic'
 d.rectangle((0,1000,1000,1040),fill='#fffdf5');d.text((10,1007),f"{p['id']} - {role} - actual TPS11 / original NSTDB - 2000 ground-metre window",fill='black');d.text((10,1023),'Orange: warped source. Red: reference. Rumsey / Stanford - CC BY-NC-SA 3.0.',fill='black');dest=out/f"{p['id']}.jpg";im.convert('RGB').save(dest,quality=92)
 col,row=gdal.ApplyGeoTransform(inverse,*pred);alpha=int(ds.GetRasterBand(4).ReadAsArray(int(col),int(row),1,1)[0,0]);assert alpha>0;reviews.append(dict(id=p['id'],role=role,figure=dest.name,figure_sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),source_pixel_alpha=alpha))
(out/'receipt.json').write_text(json.dumps(dict(raster_sha256=receipt['output_sha256'],reviews=reviews,references=[dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in refs],geographic_acceptance=False),indent=2)+'\n');print('Rendered',len(reviews),'actual windows')
