import argparse,json,numpy as np
from pathlib import Path
from osgeo import gdal
from matplotlib.path import Path as Polygon
from scipy.ndimage import binary_erosion,binary_dilation
gdal.UseExceptions()
parser=argparse.ArgumentParser(description='Verify the three masks retain the complete original sheet footprint');parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args();here=Path(__file__).resolve().parent;parts=json.loads((here/'components.json').read_text());width,height=json.loads((here/'fit-main-affine-01.json').read_text())['source_dimensions'];actual=np.zeros((height,width),np.uint8)
for part in parts['components']:
 ds=gdal.Open(str(args.artifacts/f"{part['id']}-native.tif"));a=ds.GetRasterBand(4).ReadAsArray();assert a.shape==actual.shape;actual+=(a>0).astype(np.uint8)
ring=parts['components'][0]['ring_pixel_xy'];path=Polygon(np.array(ring+[ring[0]]));expected=np.zeros(actual.shape,bool)
for y in range(0,height,128):
 yy,xx=np.mgrid[y:min(y+128,height),0:width];expected[y:y+128]=path.contains_points(np.c_[xx.ravel()+.5,yy.ravel()+.5]).reshape(xx.shape)
missing=int(np.count_nonzero(binary_erosion(expected,np.ones((3,3)))&(actual==0)));excess=int(np.count_nonzero(~binary_dilation(expected,np.ones((3,3)))&(actual>0)));overlap=int(np.count_nonzero(actual>1));result=dict(method='Union of all original-frame alpha masks compared with independently sampled full-neatline polygon at pixel centres',original_dimensions=[width,height],edge_tolerance_native_pixels=1,missing_interior_source_pixels=missing,excess_source_pixels=excess,overlapping_source_pixels=overlap,union_source_pixels=int(np.count_nonzero(actual)),passed=missing==0 and excess==0 and overlap==0);(args.artifacts/'source-union-coverage.json').write_text(json.dumps(result,indent=2)+'\n');print(result)
