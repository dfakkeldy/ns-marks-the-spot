"""Show all reference positions without clipping labels at the raster edge."""
from pathlib import Path
from osgeo import gdal
from PIL import Image,ImageDraw,ImageFont
import numpy as np,json,hashlib
from tools.church.gcps import load_gcps
from tools.church.geometry import lonlat_to_mercator
gdal.UseExceptions();r=Path(__file__).resolve().parent;f=json.loads((r/'freeze.json').read_text());ds=gdal.Open(f['raster']);width=900;height=round(ds.RasterYSize/ds.RasterXSize*width);left,top=100,55;cw,ch=width+200,height+110+75
v=gdal.Translate('',ds,format='MEM',width=width,height=height,resampleAlg='bilinear');im=Image.new('RGBA',(cw,ch),'#eef0e8');im.alpha_composite(Image.fromarray(np.moveaxis(v.ReadAsArray(),0,2)),(left,top));d=ImageDraw.Draw(im);font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',14);inv=gdal.InvGeoTransform(ds.GetGeoTransform());points=[]
offsets={'C01':(18,-25),'R54':(-40,12),'R48':(-10,-43),'R49':(25,-10),'R50':(10,23),'G05':(12,-25),'H03':(5,10),'R44':(14,-6)}
for p in load_gcps(r/'fresh-validation.csv'):
 col,row=gdal.ApplyGeoTransform(inv,*lonlat_to_mercator(p.lon,p.lat));x=left+col/ds.RasterXSize*width;y=top+row/ds.RasterYSize*height;color='#bc2828' if p.role=='check' else '#17589a';dx,dy=offsets.get(p.label,(8,-8));tx,ty=x+dx,y+dy
 if p.label in offsets:d.line((x,y,tx+(8 if dx<0 else 0),ty+7),fill=color,width=1)
 if p.role=='check':d.line((x-7,y-7,x+7,y+7),fill=color,width=3);d.line((x-7,y+7,x+7,y-7),fill=color,width=3)
 else:d.ellipse((x-4,y-4,x+4,y+4),fill=color)
 bbox=d.textbbox((tx,ty),p.label,font=font,stroke_width=1);assert bbox[0]>=0 and bbox[1]>=0 and bbox[2]<=cw and bbox[3]<ch-75;d.text((tx,ty),p.label,fill=color,font=font,stroke_width=1,stroke_fill='white');points.append({'id':p.label,'role':p.role,'lonlat':[p.lon,p.lat],'display_xy':[x,y],'label_xy':[tx,ty]})
y=ch-75;d.rectangle((0,y,cw,ch),fill='white');d.text((12,y+8),'Richmond affine14: 14 controls (blue); 17 fresh reference positions (red)',font=font,fill='black');d.text((12,y+29),'Seventeen fresh checks; western-interior addition does not close whole-panel coverage.',font=font,fill='black');d.text((12,y+50),'David Rumsey / Stanford - CC BY-NC-SA 3.0. Original NSTDB reference coordinates.',font=font,fill='black');dest=r/'coverage-overview.jpg';im.convert('RGB').save(dest,quality=93);dest.with_suffix('.json').write_text(json.dumps({'raster_sha256':f['raster_sha256'],'figure_sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'map_rect':[left,top,width,height],'points':points,'scope':'Reference-location distribution only. Margin and label leaders do not alter the raster extent or observation coordinates.'},indent=2)+'\n')
