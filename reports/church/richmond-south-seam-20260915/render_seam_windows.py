"""Render paired actual GeoTIFF windows against one original reference frame."""
from pathlib import Path
import json,hashlib,math
import numpy as np
from PIL import Image,ImageDraw
from osgeo import gdal
from tools.church.geometry import lonlat_to_mercator
R=Path(__file__).resolve().parent;f=json.loads((R/'freeze.json').read_text());seam=json.loads((R/'seam-first.json').read_text());out=R/'warped-review';out.mkdir(exist_ok=True);gdal.UseExceptions();ds={}
for name in ['richmond','south']:
 rec=f[name+'_raster'];p=Path(rec['path']);assert hashlib.sha256(p.read_bytes()).hexdigest()==rec['sha256'];ds[name]=gdal.Open(str(p))
refs=Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/reference/water-lines.geojson');lines=[]
for v in json.loads(refs.read_text())['features']:
 if v['geometry']['type']!='LineString':continue
 a=np.array([lonlat_to_mercator(*p[:2]) for p in v['geometry']['coordinates']]);lines.append((a,a.min(axis=0),a.max(axis=0)))
reviews=[]
for pair in seam['pairs']:
 lon,lat=pair['common_reference_lonlat'];cx,cy=lonlat_to_mercator(lon,lat);span=3000;half=span/2/math.cos(math.radians(lat));bounds=[cx-half,cy-half,cx+half,cy+half];images=[]
 def px(p):return ((p[0]-bounds[0])/(half*2)*800,(bounds[3]-p[1])/(half*2)*800)
 for name in ['richmond','south']:
  view=gdal.Warp('',ds[name],format='MEM',outputBounds=bounds,width=800,height=800,resampleAlg='bilinear',dstAlpha=True);im=Image.new('RGBA',(800,880),'#efefea');im.alpha_composite(Image.fromarray(np.moveaxis(view.ReadAsArray(),0,2)));d=ImageDraw.Draw(im)
  for a,lo,hi in lines:
   if hi[0]>=bounds[0] and lo[0]<=bounds[2] and hi[1]>=bounds[1] and lo[1]<=bounds[3]:d.line([px(p) for p in a],fill='#0077aa',width=1)
  pred=lonlat_to_mercator(*pair[name+'_prediction_lonlat']);x,y=px(pred);d.line((x-12,y-12,x+12,y+12),fill='#dc6c00',width=3);d.line((x-12,y+12,x+12,y-12),fill='#dc6c00',width=3);d.line((385,400,415,400),fill='red',width=2);d.line((400,385,400,415),fill='red',width=2)
  d.rectangle((0,800,800,880),fill='#fffdf5');label=pair[name+'_id'];role=pair[name+'_role'];d.text((8,807),name+' '+label+' - '+role,fill='black');d.text((8,825),'Actual raster; same 3000 ground-metre window. Orange X: source; red +: reference.',fill='black');d.text((8,843),'Blue: original NSTDB water. David Rumsey / Stanford - CC BY-NC-SA 3.0.',fill='black');d.text((8,861),'Centroid comparison only; does not establish complete coastline agreement.',fill='black')
  dest=out/(pair['richmond_id']+'-'+name+'.jpg');im.convert('RGB').save(dest,quality=94);inv=gdal.InvGeoTransform(ds[name].GetGeoTransform());col,row=gdal.ApplyGeoTransform(inv,*pred);alpha=int(ds[name].GetRasterBand(4).ReadAsArray(int(col),int(row),1,1)[0,0]);assert alpha>0;reviews.append(dict(pair=pair['richmond_id'],panel=name,figure=dest.name,figure_sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),source_pixel_alpha=alpha));images.append(im.convert('RGB'))
 joined=Image.new('RGB',(1600,880),'white');joined.paste(images[0],(0,0));joined.paste(images[1],(800,0));joined.save(out/(pair['richmond_id']+'-pair.jpg'),quality=94)
(out/'receipt.json').write_text(json.dumps({'rasters':{name:f[name+'_raster'] for name in ds},'reference_path':str(refs),'reference_sha256':hashlib.sha256(refs.read_bytes()).hexdigest(),'reviews':reviews,'scope':'Four actual raster windows, two paired source-feature centroids; no whole-seam or geographic acceptance'},indent=2)+'\n');print('Rendered four individual and two paired seam windows')
