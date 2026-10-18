"""Render a reversible 20-projected-metre affine review; no acceptance or publication."""
import argparse,json,hashlib,subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from tools.church.gcps import load_gcps
from tools.church.residuals import solve_affine
from tools.church.georeference import build_gcp_arguments
from tools.church.panels import get_panel
HERE=Path(__file__).resolve().parent

def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def run(*a):return subprocess.check_output(list(map(str,a)),text=True)
def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True);source_hash=digest(a.source);assert source_hash=='37021ed086f7bbce542b519e9a74242acc5b53ed1944880468f6f91d6234a7f8'
 cs=[p for p in load_gcps(HERE/'physical-trial.csv') if p.role=='control'];assert len(cs)==4;fit=solve_affine(cs);ring=get_panel('inverness','south').cutline.vertices;world=[fit.apply(*p) for p in ring];world.append(world[0]);cut=a.out/'south-review-cutline.geojson';cut.write_text(json.dumps(dict(type='FeatureCollection',crs=dict(type='name',properties=dict(name='EPSG:3857')),features=[dict(type='Feature',properties={},geometry=dict(type='Polygon',coordinates=[world]))])))
 vrt=a.out/'south-review.vrt';run('gdal_translate','-q','-of','VRT','-a_srs','EPSG:3857','-mo','TIFFTAG_COPYRIGHT=David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries; CC BY-NC-SA 3.0; https://www.davidrumsey.com/about/copyright-and-permissions','-mo','TIFFTAG_IMAGEDESCRIPTION=PROVISIONAL RESEARCH REVIEW. Inverness south four-physical-control affine; not a replacement for accepted baseline.','-mo','SOURCE_URL=https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~353591~90120835/manifest',*build_gcp_arguments(cs),a.source.resolve(),vrt)
 tree=ET.parse(vrt);root=tree.getroot();gcps=root.find('GCPList');srs=gcps.attrib['Projection'];root.remove(gcps);ET.SubElement(root,'SRS').text=srs;ET.SubElement(root,'GeoTransform').text=','.join(map(str,[fit.c,fit.a,fit.b,fit.f,fit.d,fit.e]));tree.write(vrt)
 out=a.out/'south-explicit-affine-20m.tif';run('gdalwarp','-q','-overwrite','-et','0','-t_srs','EPSG:3857','-r','bilinear','-tr','20','20','-tap','-cutline',cut,'-crop_to_cutline','-dstalpha','-wm','256','-co','COMPRESS=DEFLATE','-co','TILED=YES','-co','BIGTIFF=IF_SAFER',vrt,out);info=json.loads(run('gdalinfo','-json',out));assert info['bands'][-1]['colorInterpretation']=='Alpha';receipt=dict(source=str(a.source),source_sha256=source_hash,fit_csv_sha256=digest(HERE/'physical-trial.csv'),source_cutline=list(ring),transform='Frozen forward affine encoded explicitly as GeoTransform; exact -et 0',crs='EPSG:3857',cell_size_projected_m=20,orientation_determinant=fit.a*fit.e-fit.b*fit.d,output=str(out),output_sha256=digest(out),size=info['size'],geographic_acceptance=False,accepted_baseline_replaced=False,scope='Full existing content cutline research review at reduced resolution; not whole-panel geographic acceptance');(a.out/'artifact-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
