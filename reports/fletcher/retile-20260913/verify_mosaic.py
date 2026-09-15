"""Verify the composite retains every input sheet's opaque footprint."""
import argparse
import json
import math
from pathlib import Path
import numpy as np
from osgeo import gdal

gdal.UseExceptions()
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--source', required=True)
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
m = gdal.Open(a.source)
gt = m.GetGeoTransform()
data = json.loads(Path(__file__).with_name('inputs.json').read_text())
rows = []
for sheet in data['sheets']:
    src = gdal.Open(sheet['raster']['path'])
    g = src.GetGeoTransform()
    x0 = max(0, math.floor((g[0]-gt[0])/gt[1]))
    y0 = max(0, math.floor((g[3]-gt[3])/gt[5]))
    x1 = min(m.RasterXSize, math.ceil((g[0]+src.RasterXSize*g[1]-gt[0])/gt[1]))
    y1 = min(m.RasterYSize, math.ceil((g[3]+src.RasterYSize*g[5]-gt[3])/gt[5]))
    expected = gdal.Warp('', src, format='MEM', outputBounds=[gt[0]+x0*gt[1],gt[3]+y1*gt[5],gt[0]+x1*gt[1],gt[3]+y0*gt[5]], width=x1-x0,height=y1-y0,srcAlpha=True,dstAlpha=True,resampleAlg='near')
    wanted = expected.GetRasterBand(4).ReadAsArray() > 0
    expected = None
    actual = m.GetRasterBand(4).ReadAsArray(x0,y0,x1-x0,y1-y0)
    row = {'sheet': sheet['sheet'], 'source_coverage_cells': int(wanted.sum()), 'lost_coverage_cells': int(np.count_nonzero(wanted & (actual == 0)))}
    rows.append(row)
    print(row, flush=True)
    assert row['source_coverage_cells'] > 0 and row['lost_coverage_cells'] == 0
    src = None
result = {'sheets':rows, 'all_24_sheets_preserved':len(rows)==24,'lost_coverage_cells':sum(r['lost_coverage_cells'] for r in rows),'scope':'Composite coverage mechanics, including input islands/extensions. Overlaps may use the higher-priority sheet; geographic gaps and acceptance remain unchanged.'}
a.out.write_text(json.dumps(result,indent=2)+'\n')
