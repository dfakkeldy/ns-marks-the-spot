"""Actual candidate GeoTIFF against untouched source reference, controls labelled."""
import json,hashlib,math,subprocess
from pathlib import Path
import numpy as np
from osgeo import gdal
from PIL import Image,ImageDraw
from tools.church.geometry import lonlat_to_mercator
from tools.church.georeference import build_gcp_arguments
from tools.church.gcps import load_gcps
HERE=Path(__file__).resolve().parent
CACHE=Path('/Users/dfakkeldy/Downloads/church-north-continuation-20260914')
RASTER=CACHE/'tps5-rendered/inverness-north-tps5-review-20m.tif'
receipt=json.loads((HERE/'north-tip-trial/artifact-receipt.json').read_text());assert hashlib.sha256(RASTER.read_bytes()).hexdigest()==receipt['output_sha256']
references=[Path('/Users/dfakkeldy/Downloads')/f'fletcher-sheet{n:02}/reference-full/water-lines.geojson' for n in [1,3,6]]+[HERE.parent/'distributed-review-20260913/inverness-north/I13-reference-features.geojson']
features={}
for p in references:
 for f in json.loads(p.read_text())['features']:
  if f['id'] in features:assert features[f['id']]['geometry']==f['geometry']
  features[f['id']]=f
projected=[]
for f in features.values():
 for line in [f['geometry']['coordinates']]:
  v=np.array([lonlat_to_mercator(*q) for q in line]);projected.append((v,v.min(axis=0),v.max(axis=0)))
cs=load_gcps(HERE/'north-tip-trial/controls.csv');points=[json.loads(p.read_text()) for p in sorted((HERE/'observations').glob('I*.json'))]
for p in load_gcps(HERE/'north-tip-trial/diagnostic-review.csv'):
 if p.role=='check':points.append(dict(id=p.label,pixel_xy=[p.pixel_x,p.pixel_y],lonlat=[p.lon,p.lat]))
output=subprocess.check_output(['gdaltransform','-tps',*build_gcp_arguments(cs)],input=''.join(f"{p['pixel_xy'][0]} {p['pixel_xy'][1]}\n" for p in points),text=True)
xy=[list(map(float,line.split()[:2])) for line in output.splitlines()];out=HERE/'warped-review';out.mkdir(exist_ok=True);gdal.UseExceptions();ds=gdal.Open(str(RASTER));inv=gdal.InvGeoTransform(ds.GetGeoTransform());reviews=[]
for p,pred in zip(points,xy):
 lon,lat=p['lonlat'];mx,my=lonlat_to_mercator(lon,lat);half=1000/math.cos(math.radians(lat));bounds=[mx-half,my-half,mx+half,my+half]
 view=gdal.Warp('',ds,format='MEM',outputBounds=bounds,width=1000,height=1000,resampleAlg='bilinear',dstAlpha=True);im=Image.new('RGBA',(1000,1040),'#efefea');im.alpha_composite(Image.fromarray(np.moveaxis(view.ReadAsArray(),0,2)));d=ImageDraw.Draw(im)
 def px(v):return ((v[0]-bounds[0])/(2*half)*1000,(bounds[3]-v[1])/(2*half)*1000)
 for v,lo,hi in projected:
  if hi[0]>=bounds[0] and lo[0]<=bounds[2] and hi[1]>=bounds[1] and lo[1]<=bounds[3]:d.line([px(q) for q in v],fill='#0077aa',width=2)
 x,y=px(pred);d.line((x-13,y-13,x+13,y+13),fill='#d96a00',width=3);d.line((x-13,y+13,x+13,y-13),fill='#d96a00',width=3);d.line((482,500,518,500),fill='red',width=3);d.line((500,482,500,518),fill='red',width=3)
 role='CONTROL - not validation' if p['id']=='I14' else 'fresh check' if p['id']=='I15' else 'diagnostic'
 d.rectangle((0,1000,1000,1040),fill='#fffdf5');d.text((10,1007),f"{p['id']} · {role} · actual TPS5 / original NSTDB · 2000 ground-metre window",fill='black');d.text((10,1023),'Orange: warped source. Red: reference. Rumsey / Stanford · CC BY-NC-SA 3.0.',fill='black');file=out/(p['id']+'-tps5.jpg');im.convert('RGB').save(file,quality=92)
 col,row=gdal.ApplyGeoTransform(inv,*pred);alpha=int(ds.GetRasterBand(4).ReadAsArray(int(col),int(row),1,1)[0,0]);assert alpha>0
 reviews.append(dict(id=p['id'],role=role,figure=file.name,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),source_pixel_alpha=alpha,raster_pixel_xy=[col,row]))
(out/'receipt.json').write_text(json.dumps(dict(raster_sha256=receipt['output_sha256'],reviews=reviews,references=[dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in references],geographic_acceptance=False),indent=2)+'\n');print('Rendered',len(reviews),'actual windows')
