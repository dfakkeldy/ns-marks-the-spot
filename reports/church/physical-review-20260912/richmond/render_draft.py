"""Render the reviewed Richmond affine draft, without accepting or publishing it.

Run from the repository root with GDAL on PATH. Large imagery stays outside Git.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.residuals import solve_affine

HERE = Path(__file__).resolve().parent
ATTRIBUTION = 'David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries'
LICENCE = 'https://www.davidrumsey.com/about/copyright-and-permissions'
SOURCE_URL = 'https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~373669~90140407/manifest'
SOURCE_SHA256 = '462194ca1ca810d88416d7cd344f17c5f37acf20c8e43381dc3064668010a5f7'

def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def run(*args):
    return subprocess.check_output(list(map(str,args)),text=True)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
    assert digest(a.source)==SOURCE_SHA256,'Source identity mismatch'
    points=load_gcps(HERE/'physical-draft.csv');controls=[p for p in points if p.role=='control'];assert len(controls)==4
    fit=solve_affine(controls);boundary=json.loads((HERE/'content-boundary.json').read_text());ring=boundary['ring_pixel_xy'];world=[fit.apply(x,y) for x,y in ring];world.append(world[0]);cutline=a.out/'richmond-cutline.geojson'
    cutline.write_text(json.dumps({'type':'FeatureCollection','crs':{'type':'name','properties':{'name':'EPSG:3857'}},'features':[{'type':'Feature','properties':{},'geometry':{'type':'Polygon','coordinates':[world]}}]},indent=2)+'\n')
    vrt=a.out/'richmond-draft.vrt';run('gdal_translate','-q','-of','VRT','-a_srs','EPSG:3857','-mo','TIFFTAG_COPYRIGHT='+ATTRIBUTION+'; CC BY-NC-SA 3.0; '+LICENCE,'-mo','TIFFTAG_IMAGEDESCRIPTION=PROVISIONAL: A.F. Church / Harold A. Church, Richmond County, published 1885. Affine georeferencing from four physical island controls, expanded content crop; not accepted for publication.','-mo','SOURCE_URL='+SOURCE_URL,*build_gcp_arguments(controls),a.source.resolve(),vrt)
    output=a.out/'richmond-physical-draft.tif';run('gdalwarp','-q','-overwrite','-order','1','-et','0','-t_srs','EPSG:3857','-r','bilinear','-tr','5','5','-tap','-cutline',cutline,'-crop_to_cutline','-dstalpha','-wm','256','-co','COMPRESS=DEFLATE','-co','TILED=YES','-co','BIGTIFF=IF_SAFER',vrt,output)
    info=json.loads(run('gdalinfo','-json',output));assert info['bands'][-1]['colorInterpretation']=='Alpha'
    run('gdal_translate','-q','-of','PNG','-outsize','1800','0',output,a.out/'richmond-draft-preview.png')
    receipt={'attribution':ATTRIBUTION,'licence_url':LICENCE,'source_url':SOURCE_URL,'changes':'Four physical-island affine controls; expanded crop excluding insets; bilinear resampling; provisional geography','source':str(a.source.resolve()),'source_sha256':SOURCE_SHA256,'controls_csv_sha256':digest(HERE/'physical-draft.csv'),'boundary_sha256':digest(HERE/'content-boundary.json'),'transform':'affine, GDAL polynomial order 1','crs':'EPSG:3857','cell_size_projected_m':5,'fit_control_count':4,'diagnostic_check_count':4,'fresh_validation_check_count':0,'geographic_acceptance':False,'publication_eligible':False,'orientation_determinant':fit.a*fit.e-fit.b*fit.d,'coverage':'Expanded mapped-content draft; all areas outside the control hull extrapolated and geographically unsupported','output':str(output.resolve()),'sha256':digest(output),'size':info['size'],'bounds':info.get('wgs84Extent'),'gdal_version':run('gdalinfo','--version').strip()}
    (a.out/'artifact-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))

if __name__=='__main__':main()
