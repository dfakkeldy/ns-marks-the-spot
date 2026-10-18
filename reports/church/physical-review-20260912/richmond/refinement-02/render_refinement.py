"""Render the seven-control Richmond TPS from the exact archival TIFF.

Keeps the first draft unchanged. A sampled orientation check precedes rendering.
"""
import argparse,json,hashlib,subprocess
from pathlib import Path
import numpy as np
from osgeo import gdal
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.cutlines import Cutline
from tools.church.cutline_warp import densify

HERE=Path(__file__).resolve().parent
SHA='462194ca1ca810d88416d7cd344f17c5f37acf20c8e43381dc3064668010a5f7'
def digest(p):
 with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def run(*a,stdin=None):return subprocess.check_output(list(map(str,a)),input=stdin,text=True)
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,required=True);parser.add_argument('--out',type=Path,required=True);a=parser.parse_args();a.out.mkdir(parents=True,exist_ok=True);assert digest(a.source)==SHA;gdal.UseExceptions()
 fresh=json.loads((HERE/'fresh-scores.json').read_text());assert fresh['fit_csv_sha256']==digest(HERE/'frozen-fit.csv')
 points=load_gcps(HERE/'frozen-fit.csv');controls=[p for p in points if p.role=='control'];assert len(controls)==7;gcp=build_gcp_arguments(controls);ring=json.loads((HERE.parent/'content-boundary.json').read_text())['ring_pixel_xy'];poly=Cutline(tuple(map(tuple,ring)))
 def transform(p):
  result=run('gdaltransform','-tps',*gcp,stdin=''.join(f'{x} {y}\n' for x,y in p));return np.array([list(map(float,r.split()[:2])) for r in result.splitlines()])
 xs=np.arange(min(p[0] for p in ring),max(p[0] for p in ring),200);ys=np.arange(min(p[1] for p in ring),max(p[1] for p in ring),200);samples=[(x,y) for y in ys for x in xs if poly.contains(x,y)]
 for p in controls:
  samples.extend((x,y) for y in np.arange(p.pixel_y-500,p.pixel_y+501,25) for x in np.arange(p.pixel_x-500,p.pixel_x+501,25) if poly.contains(x,y))
 samples=np.array(samples);b,x,y=np.split(transform(np.vstack([samples,samples+[1,0],samples+[0,1]])),3);dx=x-b;dy=y-b;det=dx[:,0]*dy[:,1]-dx[:,1]*dy[:,0];orientation=dict(sample_count=len(samples),coarse_step_native_px=200,local_control_step_native_px=25,nonnegative_determinants=int((det>=0).sum()),determinant_range=[float(det.min()),float(det.max())],scope='Finite samples; not a proof of the continuous TPS surface');assert (det<0).all(),orientation
 dense=densify(poly,250.0);world=transform(dense).tolist();world.append(world[0]);cut=a.out/'richmond-refined-v2-cutline.geojson';cut.write_text(json.dumps({'type':'FeatureCollection','crs':{'type':'name','properties':{'name':'EPSG:3857'}},'features':[{'type':'Feature','properties':{},'geometry':{'type':'Polygon','coordinates':[world]}}]},indent=2)+'\n')
 vrt=a.out/'richmond-refined-v2.vrt';run('gdal_translate','-q','-of','VRT','-a_srs','EPSG:3857','-mo','TIFFTAG_COPYRIGHT=David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries; CC BY-NC-SA 3.0; https://www.davidrumsey.com/about/copyright-and-permissions','-mo','TIFFTAG_IMAGEDESCRIPTION=PROVISIONAL Richmond County Church map: seven physical controls, TPS, expanded crop excluding insets. Diagnostic accuracy only; not accepted for publication.','-mo','SOURCE_URL=https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~373669~90140407/manifest',*gcp,a.source.resolve(),vrt)
 full=a.out/'richmond-refined-v2-tps-5m.tif';review=a.out/'richmond-refined-v2-tps-20m.tif'
 for p,res in [(review,20),(full,5)]:
  run('gdalwarp','-q','-overwrite','-tps','-et','0','-t_srs','EPSG:3857','-r','bilinear','-tr',res,res,'-tap','-cutline',cut,'-crop_to_cutline','-dstalpha','-wm','256','-co','COMPRESS=DEFLATE','-co','TILED=YES','-co','BIGTIFF=IF_SAFER',vrt,p);print(str(p),flush=True)
  if res==20:run('gdal_translate','-q','-of','PNG','-outsize','1800','0',p,a.out/'richmond-refined-v2-preview.png')
 outputs=[]
 for p in [review,full]:
  ds=gdal.Open(str(p));outputs.append(dict(path=str(p.resolve()),sha256=digest(p),bytes=p.stat().st_size,size=[ds.RasterXSize,ds.RasterYSize],geotransform=ds.GetGeoTransform(),alpha_band=ds.RasterCount));assert ds.GetRasterBand(4).GetColorInterpretation()==gdal.GCI_AlphaBand
 receipt=dict(source_path=str(a.source.resolve()),source_sha256=SHA,csv_sha256=digest(HERE/'frozen-fit.csv'),boundary_sha256=digest(HERE.parent/'content-boundary.json'),new_control_sha256=digest(HERE/'control-observation.json'),fresh_scores_sha256=digest(HERE/'fresh-scores.json'),transform='GDAL TPS -et 0',crs='EPSG:3857',control_count=7,diagnostic_check_count=6,fresh_validation_count=4,geographic_acceptance=False,orientation=orientation,outputs=outputs)
 (a.out/'artifact-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2),flush=True)
if __name__=='__main__':main()
