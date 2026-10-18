"""Render the frozen five-control TPS and audit sampled orientation."""
import argparse,hashlib,json,subprocess
from pathlib import Path
import numpy as np
from osgeo import gdal
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.cutlines import Cutline
from tools.church.cutline_warp import densify,cutline_geojson
HERE=Path(__file__).resolve().parent
SOURCE_SHA='64354868fb4a1d3bc7a8e71378e06ea15b5e691241fd1a0595e6c4b8c9bdd932'
def digest(p):
 with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def run(*args,stdin=None):return subprocess.check_output(list(map(str,args)),input=stdin,text=True)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);a=ap.parse_args();a.out.mkdir(parents=True,exist_ok=True);gdal.UseExceptions()
 freeze=json.loads((HERE/'freeze.json').read_text());assert digest(HERE/'controls.csv')==freeze['controls_csv_sha256'];assert digest(a.source)==SOURCE_SHA
 cs=load_gcps(HERE/'controls.csv');assert len(cs)==5 and all(p.role=='control' for p in cs);args=build_gcp_arguments(cs);boundary=HERE.parent/'content-boundary.json';ring=json.loads(boundary.read_text())['ring_pixel_xy'];poly=Cutline(tuple(map(tuple,ring)))
 def transform(points):
  return np.array([list(map(float,line.split()[:2])) for line in run('gdaltransform','-tps',*args,stdin=''.join(f'{x} {y}\n' for x,y in points)).splitlines()])
 samples=[(x,y) for x in np.arange(min(v[0] for v in ring),max(v[0] for v in ring),200) for y in np.arange(min(v[1] for v in ring),max(v[1] for v in ring),200) if poly.contains(x,y)]
 for p in cs:samples.extend((x,y) for x in np.arange(p.pixel_x-500,p.pixel_x+501,25) for y in np.arange(p.pixel_y-500,p.pixel_y+501,25) if poly.contains(x,y))
 samples=np.array(samples);b,x,y=np.split(transform(np.vstack([samples,samples+[1,0],samples+[0,1]])),3);dx=x-b;dy=y-b;det=dx[:,0]*dy[:,1]-dx[:,1]*dy[:,0];singular=np.linalg.svd(np.stack([dx,dy],axis=2),compute_uv=False);ratio=singular[:,0]/singular[:,1]
 orientation=dict(sample_count=len(samples),coarse_spacing_native_px=200,near_control_spacing_native_px=25,nonnegative_determinants=int((det>=0).sum()),determinant_range=[float(det.min()),float(det.max())],anisotropy_range=[float(ratio.min()),float(ratio.max())],scope='Finite one-pixel forward differences only, not a proof of the continuous TPS surface');assert (det<0).all(),orientation
 cut=a.out/'north-tps5-cutline.geojson';cut.write_text(cutline_geojson(transform(densify(poly,250)).tolist(),3857));vrt=a.out/'north-tps5.vrt'
 run('gdal_translate','-q','-of','VRT','-a_srs','EPSG:3857','-mo','TIFFTAG_COPYRIGHT=David Rumsey Map Collection / Stanford Libraries; recorded CC BY-NC-SA 3.0','-mo','TIFFTAG_IMAGEDESCRIPTION=PROVISIONAL Church Inverness north; five physical controls; TPS; no geographic acceptance.',*args,a.source.resolve(),vrt)
 raster=a.out/'inverness-north-tps5-review-20m.tif'
 run('gdalwarp','-q','-overwrite','-tps','-et','0','-t_srs','EPSG:3857','-r','bilinear','-tr','20','20','-tap','-cutline',cut,'-crop_to_cutline','-dstalpha','-wm','256','-co','COMPRESS=DEFLATE','-co','TILED=YES','-co','BIGTIFF=IF_SAFER',vrt,raster)
 info=json.loads(run('gdalinfo','-json',raster));assert info['bands'][-1]['colorInterpretation']=='Alpha'
 receipt=dict(source=str(a.source),source_sha256=SOURCE_SHA,source_scope='Hash-verified working TIFF; original JP2 native parity established only for separately audited windows.',controls_sha256=digest(HERE/'controls.csv'),freeze_sha256=digest(HERE/'freeze.json'),boundary_sha256=digest(boundary),transform='GDAL TPS -et 0',cutline_sample_native_px=250,resolution_projected_m=20,crs='EPSG:3857',output=str(raster),output_sha256=digest(raster),size=info['size'],geotransform=info['geoTransform'],cutline=str(cut),cutline_sha256=digest(cut),orientation=orientation,geographic_acceptance=False,accepted_baseline_replaced=False)
 (a.out/'artifact-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2),flush=True)
if __name__=='__main__':main()
