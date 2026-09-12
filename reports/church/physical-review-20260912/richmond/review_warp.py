"""Review actual affine GeoTIFF pixels with directly projected NSTDB coastlines."""
import argparse,json,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from osgeo import gdal

def merc(lon,lat):return 6378137*math.radians(lon),6378137*math.log(math.tan(math.pi/4+math.radians(lat)/2))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--raster',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True);gdal.UseExceptions()
    rings=[]
    for f in json.loads(a.reference.read_text())['features']:
        g=f['geometry'];polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
        for poly in polys:
            rings.extend(np.array([merc(*v[:2]) for v in ring]) for ring in poly)
    regions={'chapel-islands':[-60.802,45.691,-60.729,45.741],'saint-esprit':[-60.53,45.59,-60.45,45.67],'lennox-passage':[-61.06,45.58,-60.92,45.64],'barque-islands':[-60.71,45.54,-60.60,45.62],'unsupported-north':[-61.04,45.79,-60.74,45.97],'unsupported-west':[-61.36,45.56,-61.20,45.66]};frames=[]
    src=gdal.Open(str(a.raster))
    for name,(w,s,e,n) in regions.items():
        x0,y0=merc(w,s);x1,y1=merc(e,n);path=a.out/(name+'.png');gdal.Translate(str(path),src,projWin=[x0,y1,x1,y0],width=1000,height=0,format='PNG');ds=gdal.Open(str(path));gt=ds.GetGeoTransform();im=Image.open(path).convert('RGBA');base=Image.new('RGBA',im.size,'#f2f2f2');base.alpha_composite(im);left=base.convert('RGB');right=left.copy();d=ImageDraw.Draw(right)
        for r in rings:
            if r[:,0].max()<x0 or r[:,0].min()>x1 or r[:,1].max()<y0 or r[:,1].min()>y1:continue
            pts=np.c_[(r[:,0]-gt[0])/gt[1],(r[:,1]-gt[3])/gt[5]];d.line([tuple(v) for v in pts],fill='#0094cf',width=2)
        pair=Image.new('RGB',(left.width*2,left.height+35),'white');pair.paste(left,(0,35));pair.paste(right,(left.width,35));d=ImageDraw.Draw(pair);d.text((12,10),name+': actual warped raster',fill='black');d.text((left.width+12,10),'Same raster + NSTDB water (includes extract seams; inspect real coast only)',fill='black');pair.save(a.out/(name+'-review.jpg'),quality=90)
        frames.append(dict(name=name,lonlat_bounds=[w,s,e,n],raster=str(a.raster),reference=str(a.reference),geotransform=gt,window_size=[ds.RasterXSize,ds.RasterYSize],method='actual warped raster geographic window; modern vectors projected directly to EPSG:3857, not inverse search guide'))
    (a.out/'frames.json').write_text(json.dumps(frames,indent=2)+'\n')

if __name__=='__main__':main()
