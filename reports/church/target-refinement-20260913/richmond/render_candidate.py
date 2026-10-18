"""Full-content candidate raster using the established exact TPS render recipe."""
import argparse,hashlib,json,subprocess
from pathlib import Path
from osgeo import gdal
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.cutlines import Cutline
from tools.church.cutline_warp import densify
HERE=Path(__file__).resolve().parent
def digest(p):
 with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def run(*args,stdin=None):return subprocess.check_output(list(map(str,args)),input=stdin,text=True)
def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True);gdal.UseExceptions();freeze=json.loads((HERE/'candidate-freeze.json').read_text());csv=HERE/'candidate-controls.csv';boundary=HERE.parents[1]/'physical-review-20260912/richmond/content-boundary.json';assert digest(csv)==freeze['control_csv_sha256'];assert digest(boundary)==freeze['boundary_sha256'];assert digest(a.source)==freeze['source_sha256'];cs=load_gcps(csv);assert len(cs)==14 and all(c.role=='control' for c in cs);gcp=build_gcp_arguments(cs)
 poly=Cutline(tuple(map(tuple,json.loads(boundary.read_text())['ring_pixel_xy'])));dense=densify(poly,250);out=run('gdaltransform','-tps',*gcp,stdin=''.join(f'{x} {y}\n' for x,y in dense));world=[list(map(float,l.split()[:2])) for l in out.splitlines()];world.append(world[0]);cut=a.out/'candidate14-cutline.geojson';cut.write_text(json.dumps(dict(type='FeatureCollection',crs={'type':'name','properties':{'name':'EPSG:3857'}},features=[dict(type='Feature',properties={},geometry=dict(type='Polygon',coordinates=[world]))])))
 vrt=a.out/'candidate14.vrt';run('gdal_translate','-q','-of','VRT','-a_srs','EPSG:3857','-mo','TIFFTAG_COPYRIGHT=David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries; recorded CC BY-NC-SA 3.0','-mo','TIFFTAG_IMAGEDESCRIPTION=PROVISIONAL Church Richmond 14 physical controls; exact TPS; full audited mapped content. No geographic acceptance.',*gcp,a.source,vrt)
 raster=a.out/'richmond-candidate14-tps-20m.tif';run('gdalwarp','-q','-overwrite','-tps','-et','0','-t_srs','EPSG:3857','-r','bilinear','-tr','20','20','-tap','-cutline',cut,'-crop_to_cutline','-dstalpha','-wm','256','-co','COMPRESS=DEFLATE','-co','TILED=YES','-co','BIGTIFF=IF_SAFER',vrt,raster);ds=gdal.Open(str(raster));assert ds.GetRasterBand(4).GetColorInterpretation()==gdal.GCI_AlphaBand
 receipt=dict(source=str(a.source),source_sha256=digest(a.source),control_csv_sha256=digest(csv),boundary_sha256=digest(boundary),transform='GDAL TPS -et 0',resolution_projected_m=20,crs='EPSG:3857',output=str(raster),output_sha256=digest(raster),size=[ds.RasterXSize,ds.RasterYSize],geotransform=ds.GetGeoTransform(),cutline=str(cut),candidate_only=True,geographic_acceptance=False);(a.out/'artifact-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2),flush=True)
if __name__=='__main__':main()
