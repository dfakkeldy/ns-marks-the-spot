"""Render private affine sheet components; keep source coordinates and alpha masks.

Requires GDAL Python bindings, NumPy, Pillow and pyproj. No network or publication.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from osgeo import gdal, ogr, osr
from PIL import Image, ImageDraw
from pyproj import Transformer

gdal.UseExceptions()

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def render(source, fit_path, components_path, out, legacy_inclusive_mask=False):
    fit=json.loads(fit_path.read_text());parts=json.loads(components_path.read_text())
    assert digest(source)==fit['source_sha256'], 'Wrong original scan'
    im=Image.open(source).convert('RGB');assert list(im.size)==fit['source_dimensions']
    out.mkdir(parents=True,exist_ok=True);results=[]
    for part in parts['components']:
        # Rasterize pixel-edge polygons at native pixel centres. Pillow's inclusive
        # integer polygon fill extends the right/bottom boundary by one pixel.
        mask_ds=gdal.GetDriverByName('MEM').Create('',im.width,im.height,1,gdal.GDT_Byte)
        mask_ds.SetGeoTransform([0,1,0,0,0,1])
        vectors=ogr.GetDriverByName('Memory').CreateDataSource('')
        local=osr.SpatialReference();local.SetLocalCS('Original scan pixel frame')
        layer=vectors.CreateLayer('mask',local,ogr.wkbPolygon);polygon=ogr.Geometry(ogr.wkbPolygon)
        for coords in [part['ring_pixel_xy'],*part.get('holes_pixel_xy',[])]:
            ring=ogr.Geometry(ogr.wkbLinearRing)
            for x,y in coords:ring.AddPoint_2D(x,y)
            ring.CloseRings();polygon.AddGeometry(ring)
        feature=ogr.Feature(layer.GetLayerDefn());feature.SetGeometry(polygon);layer.CreateFeature(feature)
        mask_ds.SetProjection(local.ExportToWkt());gdal.RasterizeLayer(mask_ds,[1],layer,burn_values=[255])
        mask=Image.fromarray(mask_ds.ReadAsArray())
        if legacy_inclusive_mask:
            mask=Image.new('L',im.size);draw=ImageDraw.Draw(mask)
            draw.polygon([tuple(p) for p in part['ring_pixel_xy']],fill=255)
            for hole in part.get('holes_pixel_xy',[]):draw.polygon([tuple(p) for p in hole],fill=0)
        rgba=np.dstack([np.asarray(im),np.asarray(mask)])
        # A separate inset may supply its own independently documented native-to-ground affine.
        matrix=np.asarray(part.get('matrix',fit['matrix']))
        assert np.linalg.det(matrix[:2])<0, 'Reflected or degenerate transform'
        name=part['id'];native=out/f'{name}-native.tif'
        ds=gdal.GetDriverByName('GTiff').Create(str(native),im.width,im.height,4,gdal.GDT_Byte,options=['COMPRESS=DEFLATE'])
        ds.SetGeoTransform([matrix[2,0],matrix[0,0],matrix[1,0],matrix[2,1],matrix[0,1],matrix[1,1]])
        crs=osr.SpatialReference();crs.SetFromUserInput(fit['crs']);ds.SetProjection(crs.ExportToWkt())
        for band in range(4):ds.GetRasterBand(band+1).WriteArray(rgba[:,:,band]);ds.GetRasterBand(band+1).SetColorInterpretation([gdal.GCI_RedBand,gdal.GCI_GreenBand,gdal.GCI_BlueBand,gdal.GCI_AlphaBand][band])
        ds=None
        bbox=mask.getbbox(); cropped=out/f'{name}-crop.vrt'
        gdal.Translate(str(cropped),str(native),format='VRT',srcWin=[bbox[0],bbox[1],bbox[2]-bbox[0],bbox[3]-bbox[1]])
        tif=out/f'{name}-3857.tif';warped=gdal.Warp(str(tif),str(cropped),dstSRS='EPSG:3857',xRes=8,yRes=8,resampleAlg='bilinear',srcAlpha=True,dstAlpha=True,errorThreshold=0,creationOptions=['COMPRESS=DEFLATE'])
        gt=warped.GetGeoTransform();w,h=warped.RasterXSize,warped.RasterYSize
        png=out/f'{name}-3857.png';gdal.Translate(str(png),warped,format='PNG');alpha=warped.GetRasterBand(4).ReadAsArray();warped=None
        to_ll=Transformer.from_crs(3857,4326,always_xy=True);west,north=to_ll.transform(gt[0],gt[3]);east,south=to_ll.transform(gt[0]+w*gt[1],gt[3]+h*gt[5])
        results.append(dict(id=name,status=part['status'],png=png.name,tif=tif.name,bounds=[[south,west],[north,east]],dimensions=[w,h],output_cell_projected_m=8,opaque_pixels=int(np.count_nonzero(alpha)),source_mask_pixels=int(np.count_nonzero(np.asarray(mask))),affine_determinant=float(np.linalg.det(matrix[:2])),png_sha256=digest(png),tif_sha256=digest(tif)))
    receipt=dict(mask_rasterization='Pillow inclusive polygon compatibility' if legacy_inclusive_mask else 'GDAL native pixel-centre rasterization of pixel-edge polygons',source_sha256=digest(source),fit_sha256=digest(fit_path),components_sha256=digest(components_path),components=results)
    (out/'render-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('fit',type=Path);p.add_argument('components',type=Path);p.add_argument('out',type=Path);p.add_argument('--legacy-inclusive-mask',action='store_true');a=p.parse_args();print(json.dumps(render(a.source,a.fit,a.components,a.out,a.legacy_inclusive_mask),indent=2))
