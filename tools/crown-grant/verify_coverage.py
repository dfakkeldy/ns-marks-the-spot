"""Compare actual output alpha with independently projected component polygons.

A one-output-cell erosion/dilation tolerates rasterized edges, not geography.
"""
import argparse,json
from pathlib import Path
import numpy as np
from osgeo import gdal,ogr,osr
from pyproj import Transformer
from scipy.ndimage import binary_dilation,binary_erosion

gdal.UseExceptions()

def verify(fit_path,components_path,out):
    fit=json.loads(fit_path.read_text());parts=json.loads(components_path.read_text());tx=Transformer.from_crs(fit['crs'],3857,always_xy=True);results=[]
    for part in parts['components']:
        m=np.asarray(part.get('matrix',fit['matrix']));ds=gdal.Open(str(out/f"{part['id']}-3857.tif"));actual=ds.GetRasterBand(4).ReadAsArray()>0
        memory=ogr.GetDriverByName('Memory').CreateDataSource('');srs=osr.SpatialReference();srs.ImportFromEPSG(3857);layer=memory.CreateLayer('boundary',srs,ogr.wkbPolygon);poly=ogr.Geometry(ogr.wkbPolygon)
        for coords in [part['ring_pixel_xy'],*part.get('holes_pixel_xy',[])]:
            ring=ogr.Geometry(ogr.wkbLinearRing)
            for a,b in zip(coords,coords[1:]+coords[:1]):
                for f in np.linspace(0,1,101,endpoint=False):
                    p=np.array(a)+(np.array(b)-a)*f;e,n=np.r_[p,1]@m;x,y=tx.transform(e,n);ring.AddPoint_2D(float(x),float(y))
            ring.CloseRings();poly.AddGeometry(ring)
        feature=ogr.Feature(layer.GetLayerDefn());feature.SetGeometry(poly);layer.CreateFeature(feature)
        mask=gdal.GetDriverByName('MEM').Create('',ds.RasterXSize,ds.RasterYSize,1,gdal.GDT_Byte);mask.SetGeoTransform(ds.GetGeoTransform());mask.SetProjection(ds.GetProjection());gdal.RasterizeLayer(mask,[1],layer,burn_values=[1]);expected=mask.ReadAsArray()>0
        inside=binary_erosion(expected,np.ones((3,3),bool));outside=~binary_dilation(expected,np.ones((3,3),bool));missing=int(np.count_nonzero(inside&~actual));extra=int(np.count_nonzero(outside&actual));results.append(dict(component=part['id'],missing_interior_cells=missing,excess_cells_outside_tolerance=extra,expected_cells=int(expected.sum()),actual_alpha_cells=int(actual.sum()),passed=missing==0 and extra==0))
    result=dict(edge_tolerance_output_cells=1,method='Independent dense source polygons projected to EPSG:3857 and GDAL-rasterized; compared to actual alpha',components=results,passed=all(r['passed'] for r in results));(out/'coverage.json').write_text(json.dumps(result,indent=2)+'\n');return result
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('fit',type=Path);p.add_argument('components',type=Path);p.add_argument('out',type=Path);a=p.parse_args();result=verify(a.fit,a.components,a.out);print(json.dumps(result,indent=2));raise SystemExit(0 if result['passed'] else 1)
