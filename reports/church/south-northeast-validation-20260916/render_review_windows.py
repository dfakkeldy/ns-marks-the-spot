"""Inspect actual TPS13 raster pixels at distributed controls and diagnostics."""
from pathlib import Path
import json,hashlib,math,subprocess
import numpy as np
from osgeo import gdal
from PIL import Image,ImageDraw
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.geometry import lonlat_to_mercator
R=Path(__file__).resolve().parent;E=R;C=Path('/Users/dfakkeldy/Downloads/church-south-road-validation-20260915');freeze=json.loads((R/'freeze.json').read_text());raster=Path(freeze['raster']);assert hashlib.sha256(raster.read_bytes()).hexdigest()==freeze['raster_sha256'];cs=load_gcps(R/'controls.csv')
points=[json.loads((R/f'observations/IS{i}.json').read_text()) for i in [50,51]]
features=[];refs=[]
for layer,name in [(8,'roads'),(7,'highways'),(5,'bridges'),(6,'railways')]:
 p=C/(name+'.geojson');refs.append(p)
 for f in json.loads(p.read_text())['features']:features.append((layer,f))
water={}
for p in [Path('/Users/dfakkeldy/Downloads/church-south-validation-20260915/southwest-water-lines.geojson'),Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson'),Path('/Users/dfakkeldy/Downloads/church-review-20260913/south-west-water-lines.geojson'),Path('/Users/dfakkeldy/Downloads/church-south-eastern-validation-20260915/interior-water.geojson')]:
 refs.append(p)
 for f in json.loads(p.read_text())['features']:water[f['properties']['OBJECTID']]=f
features.extend((0,f) for f in water.values());lines=[]
for layer,f in features:
 if f['geometry']['type']!='LineString':continue
 v=np.array([lonlat_to_mercator(*q[:2]) for q in f['geometry']['coordinates']]);street=f['properties'].get('STREET','').strip();minor=street in {'','Track','Driveway','Trail','Dryweather'}
 color='#0077aa' if layer==0 else '#8c2638' if layer==6 else '#9b53aa' if layer==5 else '#333333' if layer==7 else '#bbbbbb' if minor else '#bd6600'
 lines.append((v,v.min(axis=0),v.max(axis=0),color,1 if minor and layer!=0 else 2))
gdal.UseExceptions();ds=gdal.Open(str(raster));inv=gdal.InvGeoTransform(ds.GetGeoTransform());out=E/'warped-review';out.mkdir(parents=True,exist_ok=True)
pred=subprocess.check_output(['gdaltransform','-tps',*build_gcp_arguments(cs)],input=''.join(f"{p['pixel_xy'][0]} {p['pixel_xy'][1]}\n" for p in points),text=True);pred=[list(map(float,s.split()[:2])) for s in pred.splitlines()];reviews=[]
for p,q in zip(points,pred,strict=True):
 lon,lat=p['lonlat'];x,y=lonlat_to_mercator(lon,lat);half=1000/math.cos(math.radians(lat));bounds=[x-half,y-half,x+half,y+half]
 view=gdal.Warp('',ds,format='MEM',outputBounds=bounds,width=1000,height=1000,resampleAlg='bilinear',dstAlpha=True);im=Image.new('RGBA',(1000,1060),'#efefea');im.alpha_composite(Image.fromarray(np.moveaxis(view.ReadAsArray(),0,2)));d=ImageDraw.Draw(im)
 def px(v):return ((v[0]-bounds[0])/(half*2)*1000,(bounds[3]-v[1])/(half*2)*1000)
 for v,lo,hi,color,width in lines:
  if hi[0]>=bounds[0] and lo[0]<=bounds[2] and hi[1]>=bounds[1] and lo[1]<=bounds[3]:d.line([px(a) for a in v],fill=color,width=width)
 ax,ay=px(q);d.line((ax-14,ay-14,ax+14,ay+14),fill='#ec7600',width=3);d.line((ax-14,ay+14,ax+14,ay-14),fill='#ec7600',width=3);d.line((481,500,519,500),fill='red',width=3);d.line((500,481,500,519),fill='red',width=3)
 d.rectangle((0,1000,1000,1060),fill='#fffdf5');d.text((10,1006),p['id']+' '+p['role']+'; actual TPS13 raster; 2000 ground-metre window',fill='black');d.text((10,1023),'Orange X: warped source. Red +: reference. Blue: water. Brown/black: roads/highways.',fill='black');d.text((10,1040),'David Rumsey / Stanford - CC BY-NC-SA 3.0. Reference: original NSTDB.',fill='black')
 dest=out/(p['id']+'.jpg');im.convert('RGB').save(dest,quality=93);col,row=gdal.ApplyGeoTransform(inv,*q);alpha=int(ds.GetRasterBand(4).ReadAsArray(int(col),int(row),1,1)[0,0]);assert alpha>0;reviews.append(dict(id=p['id'],figure=dest.name,figure_sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),source_pixel_alpha=alpha))
(out/'receipt.json').write_text(json.dumps(dict(raster_sha256=freeze['raster_sha256'],reviews=reviews,references=[dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in refs],geographic_acceptance=False),indent=2)+'\n');print('Rendered',len(reviews),'TPS13 fresh-validation windows')
