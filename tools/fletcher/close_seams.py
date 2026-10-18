"""Close reviewed inter-sheet gaps by locally stretching existing raster detail.

This is a cartographic derivative, never a geographic-control correction. Original
fits/checks and rasters are immutable. No inpainting, colour synthesis or source
imagery blending is used. NumPy and GDAL Python bindings are required for the CLI.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


def gap_runs(owner):
    """Return bounded empty runs and their immediately neighbouring sheet IDs."""
    empty = owner == 0
    changes = np.diff(np.r_[False, empty, False].astype(np.int8))
    for start, end in zip(np.flatnonzero(changes == 1), np.flatnonzero(changes == -1)):
        if start > 0 and end < len(owner):
            yield int(start), int(end), int(owner[start-1]), int(owner[end])



def seam_runs(owner):
    """Group tiny raster-edge cracks with an adjacent inter-sheet gap.

    Existing tiled rasters can leave a narrow supported sliver followed by a
    1–8-pixel crack at a sheet corner. Treat that entire seam as one remap;
    isolated same-sheet holes still do not qualify for closure.
    """
    pending = None
    for run in gap_runs(owner):
        if pending is not None:
            a,b,left,right = pending
            c,d,next_left,next_right = run
            if (c-b <= 32 and min(b-a,d-c) <= 8
                    and (left != right or next_left != next_right)
                    and right == next_left and np.all(owner[b:c] == right)):
                pending = (a,d,left,next_right)
                continue
            yield pending
        pending = run
    if pending is not None:
        yield pending


def close_line(pixels, owner, *, max_gap, band, allowed):
    """Inverse-map one RGBA scanline; unchanged samples remain byte-identical.

    At a gap, each side moves to its midpoint. A smoothstep displacement fades to
    zero inside each sheet. Support stops halfway into the contiguous opaque run,
    so adjustments from consecutive gaps cannot overlap. Support must be at least
    the gap width: this bounds the stretch and rejects tiny disconnected pieces.
    """
    result, labels = pixels.copy(), owner.copy()
    stats = {'closed_gaps': 0, 'closed_pixels': 0, 'moved_pixels': 0,
             'max_shift_px': 0., 'min_source_step': 1., 'pairs': {}}
    for start, end, left, right in seam_runs(owner):
        width = end-start
        pair = tuple(sorted((left, right)))
        if left == right or width > max_gap or pair not in allowed:
            continue
        left_break = np.flatnonzero(owner[:start] == 0)
        right_break = np.flatnonzero(owner[end:] == 0)
        lo = int(left_break[-1]+1) if len(left_break) else 0
        hi = int(end+right_break[0]) if len(right_break) else len(owner)
        support_left = min(max(band, 4*width), (start-lo-1)//2)
        support_right = min(max(band, 4*width), (hi-end-1)//2)
        if min(support_left, support_right) < width:
            continue
        a, b = start-1-support_left, end+support_right
        midpoint = (start+end-1)/2
        target = np.arange(a, b+1, dtype=float)
        upper = target <= midpoint
        source = target.copy()
        t = (target[upper]-a)/(midpoint-a)
        source[upper] -= (midpoint-(start-1))*t*t*(3-2*t)
        t = (b-target[~upper])/(b-midpoint)
        source[~upper] += (end-midpoint)*t*t*(3-2*t)
        if np.any(np.diff(source) <= 0):
            raise ValueError('Non-monotone seam remap')
        floor = np.floor(source).astype(int)
        ceil = np.minimum(floor+1, len(owner)-1)
        fraction = source-floor
        # Both interpolation samples must carry source imagery. A zero-weight
        # sample at an exact edge is harmless; do not sample across the gap.
        if np.any((owner[floor] == 0) | ((fraction > 1e-9) & (owner[ceil] == 0))):
            raise ValueError('Remap entered unsupported source coverage')
        for channel in range(4):
            result[channel,a:b+1] = np.rint(
                pixels[channel,floor]*(1-fraction)+pixels[channel,ceil]*fraction
            ).astype(np.uint8)
        labels[a:b+1] = owner[np.rint(source).astype(int)]
        stats['closed_gaps'] += 1
        stats['closed_pixels'] += int(np.count_nonzero(owner[start:end] == 0))
        stats['moved_pixels'] += int(np.count_nonzero(np.abs(source-target)>1e-8))
        stats['max_shift_px'] = max(stats['max_shift_px'], float(np.max(abs(source-target))))
        stats['min_source_step'] = min(stats['min_source_step'], float(np.min(np.diff(source))))
        key = f'{pair[0]:02d}-{pair[1]:02d}'
        row = stats['pairs'].setdefault(key, {'scanline_gaps':0,'closed_pixels':0,'max_gap_px':0})
        row['scanline_gaps'] += 1; row['closed_pixels'] += int(np.count_nonzero(owner[start:end] == 0))
        row['max_gap_px'] = max(row['max_gap_px'],width)
    return result, labels, stats


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value,indent=2)+'\n')


def create_like(path, source, bands):
    from osgeo import gdal
    ds = gdal.GetDriverByName('GTiff').Create(str(path), source.RasterXSize, source.RasterYSize,
        bands, gdal.GDT_Byte, options=['TILED=YES','COMPRESS=DEFLATE','BIGTIFF=IF_SAFER','NUM_THREADS=2'])
    ds.SetGeoTransform(source.GetGeoTransform()); ds.SetProjection(source.GetProjection())
    if bands == 4:
        for i, color in enumerate([gdal.GCI_RedBand,gdal.GCI_GreenBand,gdal.GCI_BlueBand,gdal.GCI_AlphaBand],1):
            ds.GetRasterBand(i).SetColorInterpretation(color)
    return ds


def build_owners(source, inputs, path):
    from osgeo import gdal
    target = create_like(path,source,1)
    gt=source.GetGeoTransform()
    sheets={s['sheet']:s for s in inputs['sheets']}
    for number in inputs['composite_order_bottom_to_top']:
        sheet=sheets[number]
        src=gdal.Open(sheet['raster']['path'])
        sg=src.GetGeoTransform()
        if sg[1:] != (5.,0.,sg[3],0.,-5.) or gt[1] != 5. or gt[5] != -5.:
            raise ValueError('Expected aligned 5 projected-metre rasters')
        x,y=round((sg[0]-gt[0])/5), round((gt[3]-sg[3])/5)
        if abs(gt[0]+x*5-sg[0])>1e-6 or abs(gt[3]-y*5-sg[3])>1e-6:
            raise ValueError('Unaligned source raster')
        for row in range(0,src.RasterYSize,512):
            h=min(512,src.RasterYSize-row)
            alpha=src.GetRasterBand(4).ReadAsArray(0,row,src.RasterXSize,h)
            owners=target.ReadAsArray(x,y+row,src.RasterXSize,h)
            owners[alpha>0]=int(number)
            target.GetRasterBand(1).WriteArray(owners,x,y+row)
        print('Owner footprint',number,flush=True)
    target.FlushCache(); target=None


def audit(source, owners, max_gap):
    result={}
    # Sample every 20 native rows/columns (100 projected metres).
    for axis in ('x','y'):
        counts={}
        length=source.RasterYSize if axis=='x' else source.RasterXSize
        for k in range(0,length,20):
            line=owners.ReadAsArray(0,k,source.RasterXSize,1).ravel() if axis=='x' else owners.ReadAsArray(k,0,1,source.RasterYSize).ravel()
            for a,b,left,right in gap_runs(line):
                if left==right or b-a>max_gap: continue
                key='-'.join(f'{s:02d}' for s in sorted((left,right)))
                row=counts.setdefault(key,{'sampled_gaps':0,'max_projected_gap_m':0})
                row['sampled_gaps']+=1
                row['max_projected_gap_m']=max(row['max_projected_gap_m'],(b-a)*5)
        result[axis]=counts
    return result


def render_pass(source_path, owner_path, out, out_owners, axis, allowed, max_gap, band):
    from osgeo import gdal
    src=gdal.Open(str(source_path)); own=gdal.Open(str(owner_path))
    dst=create_like(out,src,4); labels=create_like(out_owners,src,1)
    stats={'axis':axis,'closed_gaps':0,'closed_pixels':0,'moved_pixels':0,
        'max_shift_px':0.,'min_source_step':1.,'pairs':{},'lost_opaque_cells':0}
    length=src.RasterYSize if axis=='x' else src.RasterXSize
    for k in range(0,length,256):
        extent=min(256,length-k)
        window=(0,k,src.RasterXSize,extent) if axis=='x' else (k,0,extent,src.RasterYSize)
        pixels=src.ReadAsArray(*window); owners=own.ReadAsArray(*window)
        if axis=='y': pixels=pixels.transpose(0,2,1); owners=owners.T
        for i in range(extent):
            before=pixels[3,i]>0
            if not np.array_equal(before,owners[i]>0): raise ValueError('Owner/alpha mismatch')
            updated, ids, row=close_line(pixels[:,i],owners[i],max_gap=max_gap,band=band,allowed=allowed)
            if np.any(before & (updated[3]==0)): raise ValueError('Lost source coverage')
            added=int(np.count_nonzero(~before & (updated[3]>0)))
            if added!=row['closed_pixels']: raise ValueError('Unexpected coverage change')
            pixels[:,i]=updated; owners[i]=ids
            for field in ('closed_gaps','closed_pixels','moved_pixels'): stats[field]+=row[field]
            stats['max_shift_px']=max(stats['max_shift_px'],row['max_shift_px'])
            stats['min_source_step']=min(stats['min_source_step'],row['min_source_step'])
            for key,value in row['pairs'].items():
                aggregate=stats['pairs'].setdefault(key,{'scanline_gaps':0,'closed_pixels':0,'max_gap_px':0})
                for field in ('scanline_gaps','closed_pixels'): aggregate[field]+=value[field]
                aggregate['max_gap_px']=max(aggregate['max_gap_px'],value['max_gap_px'])
        if axis=='y': pixels=pixels.transpose(0,2,1); owners=owners.T
        dst.WriteArray(pixels,window[0],window[1]); labels.GetRasterBand(1).WriteArray(owners,window[0],window[1])
        if k%4096==0: print(axis,k,'/',length,'closed cells',stats['closed_pixels'],flush=True)
    dst.FlushCache(); labels.FlushCache(); dst=None; labels=None
    stats['raster_sha256']=digest(out)
    write(out.with_suffix('.json'),stats)
    return stats


def main():
    from osgeo import gdal
    gdal.UseExceptions(); gdal.SetCacheMax(256*1024*1024)
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--inputs',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--pairs',type=Path,help='Reviewed per-axis sheet-pair JSON; omitted means audit only')
    p.add_argument('--max-gap-m',type=int,default=3000,help='Projected metres; not ground metres')
    p.add_argument('--band-m',type=int,default=3000,help='Minimum inward fade; expands to four gap widths')
    a=p.parse_args()
    a.out.mkdir(parents=True,exist_ok=True)
    inputs=json.loads(a.inputs.read_text())
    if digest(a.source)!=inputs['composite']['sha256']: raise ValueError('Unrecognized input mosaic')
    owners=a.out/'source-owners.tif'
    if owners.exists(): raise ValueError('Use a new output directory')
    for sheet in inputs['sheets']:
        if digest(sheet['raster']['path'])!=sheet['raster']['sha256']: raise ValueError('Changed source sheet')
    src=gdal.Open(str(a.source))
    build_owners(src,inputs,owners)
    baseline=audit(src,gdal.Open(str(owners)),a.max_gap_m//5)
    write(a.out/'baseline-audit.json',baseline)
    if not a.pairs: return
    config=json.loads(a.pairs.read_text())
    results=[]; current=a.source; current_owners=owners
    for index, axis in enumerate(('x','y','x')):
        allowed={tuple(sorted(map(int,pair.split('-')))) for pair in config[axis]}
        out=a.out/f'closed-{index}-{axis}.tif'; out_owners=a.out/f'owners-{index}-{axis}.tif'
        results.append(render_pass(current,current_owners,out,out_owners,axis,allowed,a.max_gap_m//5,a.band_m//5))
        if current != a.source:
            current.unlink()  # Only this run's reproducible intermediate raster.
            current_owners.unlink()
        current,current_owners=out,out_owners
    remaining=audit(gdal.Open(str(current)),gdal.Open(str(current_owners)),a.max_gap_m//5)
    write(a.out/'remaining-audit.json',remaining)
    write(a.out/'receipt.json',{'status':'cartographically adjusted local derivative; not geographic improvement or publication',
        'input_sha256':inputs['composite']['sha256'],'inputs_sha256':digest(a.inputs),'pairs_sha256':digest(a.pairs),
        'max_gap_projected_m':a.max_gap_m,'minimum_fade_projected_m':a.band_m,'passes':results,
        'output':str(current),'output_sha256':digest(current),'original_geographic_fits_changed':False})

if __name__=='__main__': main()
