"""Plot reference control/check distribution on the unchanged review raster."""
from pathlib import Path
from osgeo import gdal
from PIL import Image,ImageDraw,ImageFont
import numpy as np,json,hashlib
from tools.church.gcps import load_gcps
from tools.church.geometry import lonlat_to_mercator
gdal.UseExceptions();r=Path(__file__).resolve().parent;f=json.loads((r/'freeze.json').read_text());d=gdal.Open(f['raster']);width=900;height=round(d.RasterYSize/d.RasterXSize*width);v=gdal.Translate('',d,format='MEM',width=width,height=height,resampleAlg='bilinear');im=Image.new('RGBA',(width,height+75),'#eef0e8');im.alpha_composite(Image.fromarray(np.moveaxis(v.ReadAsArray(),0,2)));dr=ImageDraw.Draw(im);font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',14);inv=gdal.InvGeoTransform(d.GetGeoTransform());points=[]
for p in load_gcps(r/'fresh-validation.csv'):
 col,row=gdal.ApplyGeoTransform(inv,*lonlat_to_mercator(p.lon,p.lat));x=col/d.RasterXSize*width;y=row/d.RasterYSize*height;color='#bc2828' if p.role=='check' else '#17589a'
 if p.role=='check':dr.line((x-7,y-7,x+7,y+7),fill=color,width=3);dr.line((x-7,y+7,x+7,y-7),fill=color,width=3)
 else:dr.ellipse((x-4,y-4,x+4,y+4),fill=color)
 dr.text((x+8,y-8),p.label,fill=color,font=font,stroke_width=1,stroke_fill='white');points.append({'id':p.label,'role':p.role,'lonlat':[p.lon,p.lat],'display_xy':[x,y]})
dr.rectangle((0,height,width,height+75),fill='white');dr.text((12,height+8),'Frozen south TPS13: blue dots = 13 controls; red crosses = 8 fresh reference positions',font=font,fill='black');dr.text((12,height+29),'Eight fresh checks remain sparse; interior and edge coverage is still incomplete.',font=font,fill='black');dr.text((12,height+50),'David Rumsey / Stanford - CC BY-NC-SA 3.0. Original NSTDB reference coordinates.',font=font,fill='black');out=r/'coverage-overview.jpg';im.convert('RGB').save(out,quality=93);out.with_suffix('.json').write_text(json.dumps({'raster_sha256':f['raster_sha256'],'figure_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'points':points,'scope':'Reference-location distribution only; no point taken from this overview'},indent=2)+'\n')
