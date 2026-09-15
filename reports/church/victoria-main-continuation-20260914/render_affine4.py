"""Render the frozen affine through the verified explicit-GeoTransform path."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
from tools.church.gcps import load_gcps
from tools.church.georeference import build_gcp_arguments
from tools.church.residuals import solve_affine

HERE = Path(__file__).resolve().parent

def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()

def run(*args):
    return subprocess.check_output(list(map(str,args)),text=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    freeze=json.loads((HERE/'affine4-freeze.json').read_text())
    csv=HERE/'affine4-controls.csv'
    boundary=HERE/'content-boundary.json'
    assert digest(csv)==freeze['control_csv_sha256']
    assert digest(args.source)==freeze['source_sha256']
    assert digest(boundary)==freeze['boundary_sha256']
    controls=load_gcps(csv)
    assert len(controls)==4 and all(p.role=='control' for p in controls)
    fit=solve_affine(controls)
    ring=json.loads(boundary.read_text())['ring_pixel_xy']
    world=[fit.apply(*p) for p in ring]
    world.append(world[0])
    cutline=args.out/'main-affine4-cutline.geojson'
    cutline.write_text(json.dumps(dict(type='FeatureCollection',crs=dict(type='name',properties=dict(name='EPSG:3857')),features=[dict(type='Feature',properties={},geometry=dict(type='Polygon',coordinates=[world]))])))
    vrt=args.out/'main-affine4.vrt'
    run('gdal_translate','-q','-of','VRT','-a_srs','EPSG:3857','-mo','TIFFTAG_COPYRIGHT=David Rumsey Map Collection / Stanford Libraries; recorded CC BY-NC-SA 3.0','-mo','TIFFTAG_IMAGEDESCRIPTION=PROVISIONAL Church Victoria main boundary draft 4-control affine; complete review content; no geographic acceptance.',*build_gcp_arguments(controls),args.source.resolve(),vrt)
    tree=ET.parse(vrt)
    root=tree.getroot()
    gcps=root.find('GCPList')
    srs=gcps.attrib['Projection']
    root.remove(gcps)
    ET.SubElement(root,'SRS').text=srs
    ET.SubElement(root,'GeoTransform').text=','.join(map(str,[fit.c,fit.a,fit.b,fit.f,fit.d,fit.e]))
    tree.write(vrt)
    raster=args.out/'victoria-main-affine4-boundary-draft-20m.tif'
    run('gdalwarp','-q','-overwrite','-et','0','-t_srs','EPSG:3857','-r','bilinear','-tr','20','20','-tap','-cutline',cutline,'-crop_to_cutline','-dstalpha','-wm','256','-co','COMPRESS=DEFLATE','-co','TILED=YES','-co','BIGTIFF=IF_SAFER',vrt,raster)
    info=json.loads(run('gdalinfo','-json',raster))
    assert info['bands'][-1]['colorInterpretation']=='Alpha'
    receipt=dict(source=str(args.source),source_sha256=digest(args.source),control_csv_sha256=digest(csv),boundary_sha256=digest(boundary),transform='Frozen affine encoded as explicit GeoTransform; exact -et 0',resolution_projected_m=20,crs='EPSG:3857',output=str(raster),output_sha256=digest(raster),size=info['size'],geotransform=info['geoTransform'],cutline=str(cutline),cutline_sha256=digest(cutline),orientation_determinant=fit.a*fit.e-fit.b*fit.d,geographic_acceptance=False,accepted_baseline_replaced=False)
    (args.out/'artifact-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2),flush=True)

if __name__=='__main__':
    main()
