"""Close the separately reviewed wide 08–09 wedge and freeze the tile input.

Run after close_seams.py. The wider adjustment is restricted to sheets 08/09;
other gaps retain the 3000 projected-metre threshold. Large files stay outside Git.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT))
from tools.fletcher.close_seams import audit, digest, render_pass, write
from osgeo import gdal

def main():
    gdal.UseExceptions(); gdal.SetCacheMax(256*1024*1024)
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True,help='New finishing directory')
    a=p.parse_args(); d=a.out
    d.mkdir(parents=True,exist_ok=False)
    receipt=json.loads((a.directory/'receipt.json').read_text())
    source=Path(receipt['output']); owner=a.directory/'owners-2-x.tif'
    if digest(source)!=receipt['output_sha256']: raise ValueError('Changed primary repair')
    original_path=ROOT/'reports/fletcher/retile-20260913/inputs.json'
    original=json.loads(original_path.read_text())
    frames=[]
    for sheet in original['sheets']:
        if sheet['sheet'] not in ('08','09','10','11'): continue
        ds=gdal.Open(sheet['raster']['path']); gt=ds.GetGeoTransform()
        frames.append((gt[0],gt[3]-ds.RasterYSize*5,gt[0]+ds.RasterXSize*5,gt[3]))
    src=gdal.Open(str(source)); gt=src.GetGeoTransform()
    left=min(b[0] for b in frames);bottom=min(b[1] for b in frames)
    right=max(b[2] for b in frames);top=max(b[3] for b in frames)
    window=[round((left-gt[0])/5),round((gt[3]-top)/5),round((right-left)/5),round((top-bottom)/5)]
    options=['TILED=YES','COMPRESS=DEFLATE','NUM_THREADS=2']
    for before,target in [(source,d/'wide-before.tif'),(owner,d/'wide-before-owners.tif')]:
        if target.exists(): raise ValueError('Use a fresh finishing output')
        gdal.Translate(str(target),str(before),srcWin=window,creationOptions=options)
    stats=render_pass(d/'wide-before.tif',d/'wide-before-owners.tif',d/'wide-after.tif',d/'wide-after-owners.tif','x',{(8,9)},1600,600)
    corner_pairs={(8,9),(8,10),(8,11),(9,10),(9,11),(10,11)}
    corner_y=render_pass(d/'wide-after.tif',d/'wide-after-owners.tif',d/'corner-y.tif',d/'corner-y-owners.tif','y',corner_pairs,600,600)
    corner_x=render_pass(d/'corner-y.tif',d/'corner-y-owners.tif',d/'corner-x.tif',d/'corner-x-owners.tif','x',corner_pairs,600,600)
    outputs=[]
    for before,patch,target in [(source,d/'corner-x.tif',d/'fletcher-cartographic-mosaic.tif'),(owner,d/'corner-x-owners.tif',d/'final-owners.tif')]:
        if target.exists(): raise ValueError('Refuse existing final artifact')
        # macOS copy-on-write avoids an unnecessary multi-GB physical copy.
        if sys.platform=='darwin': subprocess.run(['cp','-c',str(before),str(target)],check=True)
        else: shutil.copy2(before,target)
        ds=gdal.Open(str(target),gdal.GA_Update); part=gdal.Open(str(patch))
        for row in range(0,window[3],256):
            values=part.ReadAsArray(0,row,window[2],min(256,window[3]-row))
            if values.ndim==2: ds.GetRasterBand(1).WriteArray(values,window[0],window[1]+row)
            else: ds.WriteArray(values,window[0],window[1]+row)
        ds.FlushCache();ds=None; outputs.append(target)
    final=gdal.Open(str(outputs[0]))
    final_receipt={**receipt,'primary_repair_sha256':receipt['output_sha256'],
        'wide_wedge':{'sheets':['08','09'],'max_gap_projected_m':8000,'native_window':window,'pass':stats,'junction_passes':[corner_y,corner_x]},
        'output':str(outputs[0]),'output_sha256':digest(outputs[0]),
        'builder_sha256':digest(__file__),'remapper_sha256':digest(ROOT/'tools/fletcher/close_seams.py')}
    write(d/'final-receipt.json',final_receipt)
    write(d/'remaining-audit-final.json',audit(final,gdal.Open(str(outputs[1])),600))
    inputs={'revision':'fletcher-seams-20261009.2','status':'local cartographic review; not published',
        'modifications':'Georeferenced, cropped, locally stretched at adjoining sheet edges for visual continuity, and tiled. Geographic fits remain separate; positions near joins are cartographically adjusted.',
        'baseline_manifest_sha256':digest(original_path),'baseline':original,'cartographic_adjustment':final_receipt,
        'composite':{'sha256':final_receipt['output_sha256'],'dimensions':[final.RasterXSize,final.RasterYSize]}}
    write(d/'inputs.json',inputs)
    print(json.dumps({'output':str(outputs[0]),'wide_wedge':stats},indent=2),flush=True)

if __name__=='__main__': main()
