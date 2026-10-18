"""Review new checks using pixels from the unchanged explicit-affine GeoTIFF."""
from pathlib import Path
import hashlib,json,math,subprocess
import numpy as np
from osgeo import gdal
from PIL import Image,ImageDraw
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.geometry import lonlat_to_mercator
R=Path(__file__).resolve().parent;OLD=R.parent/'physical-review-20260913/inverness-south';receipt=json.loads((OLD/'final-artifact-receipt.json').read_text());raster=Path(receipt['local_output']);assert hashlib.sha256(raster.read_bytes()).hexdigest()==receipt['output_sha256']
cs=[p for p in load_gcps(OLD/'physical-trial.csv') if p.role=='control'];points=[json.loads(p.read_text()) for p in sorted((R/'observations').glob('IS*.json'))]
points=[p for p in points if p['id'] in [f'IS{i}' for i in range(20,25)]]
refs=[Path(p) for p in sorted({o['reference_path'] for o in points})];features={}
for ref in refs:
 for f in json.loads(ref.read_text())['features']:
  fid=f['properties']['OBJECTID']
  if fid in features:assert features[fid]['geometry']==f['geometry']
  features[fid]=f
lines=[]
for f in features.values():
 if f['geometry']['type']!='LineString':continue
 v=np.array([lonlat_to_mercator(*p[:2]) for p in f['geometry']['coordinates']]);lines.append((v,v.min(axis=0),v.max(axis=0)))
gdal.UseExceptions();ds=gdal.Open(str(raster));inv=gdal.InvGeoTransform(ds.GetGeoTransform());out=R/'warped-review';out.mkdir(exist_ok=True)
predictions=subprocess.check_output(['gdaltransform','-order','1',*build_gcp_arguments(cs)],input=''.join(f"{p['pixel_xy'][0]} {p['pixel_xy'][1]}\n" for p in points),text=True);predictions=[list(map(float,s.split()[:2])) for s in predictions.splitlines()];reviews=[]
for p,pred in zip(points,predictions,strict=True):
 lon,lat=p['lonlat'];x,y=lonlat_to_mercator(lon,lat);half=1000/math.cos(math.radians(lat));bounds=[x-half,y-half,x+half,y+half];v=gdal.Warp('',ds,format='MEM',outputBounds=bounds,width=1000,height=1000,resampleAlg='bilinear',dstAlpha=True);im=Image.new('RGBA',(1000,1040),'#efefea');im.alpha_composite(Image.fromarray(np.moveaxis(v.ReadAsArray(),0,2)));d=ImageDraw.Draw(im)
 def px(q):return ((q[0]-bounds[0])/(2*half)*1000,(bounds[3]-q[1])/(2*half)*1000)
 for line,lo,hi in lines:
  if hi[0]>=bounds[0] and lo[0]<=bounds[2] and hi[1]>=bounds[1] and lo[1]<=bounds[3]:d.line([px(q) for q in line],fill='#0077aa',width=2)
 ax,ay=px(pred);d.line((ax-13,ay-13,ax+13,ay+13),fill='#d66c00',width=3);d.line((ax-13,ay+13,ax+13,ay-13),fill='#d66c00',width=3);d.line((482,500,518,500),fill='red',width=3);d.line((500,482,500,518),fill='red',width=3);d.rectangle((0,1000,1000,1040),fill='#fffdf5');d.text((10,1007),f"{p['id']} fresh physical affine check; actual raster / original NSTDB; 2000 ground-metre window",fill='black');d.text((10,1023),'Orange: warped source. Red: reference. Rumsey / Stanford - CC BY-NC-SA 3.0.',fill='black');dest=out/f"{p['id']}.jpg";im.convert('RGB').save(dest,quality=92)
 col,row=gdal.ApplyGeoTransform(inv,*pred);alpha=int(ds.GetRasterBand(4).ReadAsArray(int(col),int(row),1,1)[0,0]);assert alpha>0;reviews.append(dict(id=p['id'],figure=dest.name,figure_sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),source_pixel_alpha=alpha))
(out/'receipt.json').write_text(json.dumps(dict(raster_sha256=receipt['output_sha256'],reviews=reviews,geographic_acceptance=False),indent=2)+'\n');print('Rendered',len(reviews),'actual raster windows')
