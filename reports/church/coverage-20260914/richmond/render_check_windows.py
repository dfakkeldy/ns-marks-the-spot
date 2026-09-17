"""Review actual affine GeoTIFF windows against untouched reference line geometry."""
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from osgeo import gdal
from PIL import Image, ImageDraw
from tools.church.gcps import load_gcps
from tools.church.geometry import lonlat_to_mercator
from tools.church.residuals import solve_affine

gdal.UseExceptions()
HERE=Path(__file__).resolve().parent
RASTER=Path('/Users/dfakkeldy/Downloads/church-coverage-20260914/richmond-affine14/richmond-affine14-20m.tif')
receipt=json.loads((HERE/'affine14-artifact-receipt.json').read_text())
assert hashlib.sha256(RASTER.read_bytes()).hexdigest()==receipt['output_sha256']
config=json.loads((HERE/'terrain-preview-inputs.json').read_text())
features={}
for reference in config['water_inputs']:
    path=Path(reference['path'])
    assert hashlib.sha256(path.read_bytes()).hexdigest()==reference['sha256']
    for f in json.loads(path.read_text())['features']:
        if f['id'] in features:
            assert features[f['id']]['geometry']==f['geometry']
        features[f['id']]=f
projected=[]
for f in features.values():
    geometry=f['geometry']
    parts=[geometry['coordinates']] if geometry['type']=='LineString' else geometry['coordinates']
    for part in parts:
        v=np.array([lonlat_to_mercator(*p[:2]) for p in part])
        projected.append((v,v.min(axis=0),v.max(axis=0)))
fit=solve_affine(load_gcps(HERE/'affine14-controls.csv'))
source=gdal.Open(str(RASTER))
inverse=gdal.InvGeoTransform(source.GetGeoTransform())
out=HERE/'warped-review'
out.mkdir(exist_ok=True)
reviews=[]
for path in sorted((HERE/'affine14-fresh').glob('R*-observation.json')):
    p=json.loads(path.read_text());lon,lat=p['lonlat'];mx,my=lonlat_to_mercator(lon,lat)
    half=800/math.cos(math.radians(lat));bounds=[mx-half,my-half,mx+half,my+half]
    view=gdal.Warp('',source,format='MEM',dstSRS='EPSG:3857',outputBounds=bounds,width=1000,height=1000,resampleAlg='bilinear',dstAlpha=True)
    rgba=np.moveaxis(view.ReadAsArray(),0,2)
    im=Image.new('RGBA',(1000,1050),'#eeeeea')
    im.alpha_composite(Image.fromarray(rgba),dest=(0,0))
    draw=ImageDraw.Draw(im)
    def pixel(xy):
        return ((xy[0]-bounds[0])/(2*half)*1000,(bounds[3]-xy[1])/(2*half)*1000)
    for v,minimum,maximum in projected:
        if maximum[0]<bounds[0] or minimum[0]>bounds[2] or maximum[1]<bounds[1] or minimum[1]>bounds[3]:
            continue
        draw.line([pixel(xy) for xy in v],fill='#0077aa',width=2)
    predicted=fit.apply(*p['pixel_xy'])
    px,py=pixel(predicted)
    draw.line((px-13,py-13,px+13,py+13),fill='#dd6c00',width=3)
    draw.line((px-13,py+13,px+13,py-13),fill='#dd6c00',width=3)
    draw.line((482,500,518,500),fill='red',width=3)
    draw.line((500,482,500,518),fill='red',width=3)
    draw.rectangle((0,1000,1000,1050),fill='#fffdf5')
    draw.text((12,1008),f"{p['id']} · actual affine14 raster / original NSTDB · 1600 ground-metre window",fill='black')
    draw.text((12,1026),'Red: reference. Orange: warped source observation. Grey: outside raster. Rumsey / Stanford · CC BY-NC-SA 3.0.',fill='black')
    destination=out/f"{p['id']}-affine14.jpg"
    im.convert('RGB').save(destination,quality=92)
    col,row=gdal.ApplyGeoTransform(inverse,*predicted)
    alpha=int(source.GetRasterBand(4).ReadAsArray(int(math.floor(col)),int(math.floor(row)),1,1)[0,0])
    assert alpha>0, f"Observation absent from raster: {p['id']}"
    reviews.append(dict(id=p['id'],raster_pixel_xy=[col,row],observation_pixel_alpha=alpha,figure=destination.name,figure_sha256=hashlib.sha256(destination.read_bytes()).hexdigest()))
(out/'receipt.json').write_text(json.dumps(dict(raster_sha256=receipt['output_sha256'],source='Actual delivered candidate GeoTIFF, no refit of image',window_ground_m=1600,references=config['water_inputs'],reviews=reviews,geographic_acceptance=False),indent=2)+'\n')
print(len(reviews),'rendered raster/reference windows; all source-observation locations have nonzero alpha')
