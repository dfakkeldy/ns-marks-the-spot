"""Independently compare every final cell with the unmodified published mosaic."""
import argparse
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT))
import numpy as np
from osgeo import gdal
from tools.fletcher.close_seams import digest,write

def main():
    gdal.UseExceptions();gdal.SetCacheMax(256*1024*1024)
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory',type=Path,required=True)
    p.add_argument('--original',type=Path,required=True)
    a=p.parse_args();r=a.directory
    receipt=json.loads((r/'final-receipt.json').read_text())
    assert digest(a.original)==receipt['input_sha256']
    assert digest(receipt['output'])==receipt['output_sha256']
    before_ds=gdal.Open(str(a.original));after_ds=gdal.Open(receipt['output'])
    assert before_ds.GetGeoTransform()==after_ds.GetGeoTransform()
    assert before_ds.GetProjection()==after_ds.GetProjection()
    assert (before_ds.RasterXSize,before_ds.RasterYSize)==(after_ds.RasterXSize,after_ds.RasterYSize)
    counts=dict(original_opaque=0,lost_coverage=0,added_coverage=0,changed_original_covered_pixels=0,unchanged_original_covered_pixels=0)
    for y in range(0,before_ds.RasterYSize,256):
        h=min(256,before_ds.RasterYSize-y)
        before=before_ds.ReadAsArray(0,y,before_ds.RasterXSize,h)
        after=after_ds.ReadAsArray(0,y,after_ds.RasterXSize,h)
        old=before[3]>0;new=after[3]>0;changed=np.any(before!=after,axis=0)
        counts['original_opaque']+=int(old.sum())
        counts['lost_coverage']+=int(np.count_nonzero(old&~new))
        counts['added_coverage']+=int(np.count_nonzero(~old&new))
        counts['changed_original_covered_pixels']+=int(np.count_nonzero(old&changed))
        counts['unchanged_original_covered_pixels']+=int(np.count_nonzero(old&~changed))
    assert counts['lost_coverage']==0
    passes=receipt['passes']+[receipt['wide_wedge']['pass']]+receipt['wide_wedge']['junction_passes']
    assert counts['added_coverage']==sum(x['closed_pixels'] for x in passes)
    counts.update(source_sha256=receipt['input_sha256'],final_sha256=receipt['output_sha256'],same_crs_extent_and_resolution=True,grid=[before_ds.RasterXSize,before_ds.RasterYSize])
    write(r/'coverage-verification.json',counts)
    gdal.Translate(str(r/'overview.png'),after_ds,format='PNG',width=1600,height=0)
    print(json.dumps(counts,indent=2))

if __name__=='__main__': main()
