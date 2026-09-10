"""Check actual raster alpha against an independently rasterized full neatline.

Run with GDAL Python. A one-output-cell inset avoids boundary rasterization
conventions. Exits nonzero on interior holes; this is not geographic validation.
"""

import argparse
import hashlib
import json
from pathlib import Path

from osgeo import gdal, ogr

gdal.UseExceptions()
p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--raster", type=Path, required=True)
p.add_argument("--cutline", type=Path, required=True)
p.add_argument("--out", type=Path, required=True)
a = p.parse_args()
raster = gdal.Open(str(a.raster))
mask = gdal.GetDriverByName("MEM").Create(
    "", raster.RasterXSize, raster.RasterYSize, 1, gdal.GDT_Byte
)
mask.SetGeoTransform(raster.GetGeoTransform())
mask.SetProjection(raster.GetProjection())
vector = ogr.Open(str(a.cutline))
gdal.RasterizeLayer(mask, [1], vector.GetLayer(), burn_values=[1])
expected = mask.ReadAsArray().astype(bool)
inside = expected.copy()
inside[1:] &= expected[:-1]
inside[:-1] &= expected[1:]
inside[:, 1:] &= expected[:, :-1]
inside[:, :-1] &= expected[:, 1:]
inside[[0, -1], :] = False
inside[:, [0, -1]] = False
alpha = raster.GetRasterBand(4).ReadAsArray()
holes = inside & (alpha == 0)
receipt = {
    "raster": str(a.raster),
    "raster_sha256": hashlib.sha256(a.raster.read_bytes()).hexdigest(),
    "cutline_sha256": hashlib.sha256(a.cutline.read_bytes()).hexdigest(),
    "expected_interior_cells": int(inside.sum()),
    "transparent_interior_cells": int(holes.sum()),
    "passed": not bool(holes.any()),
    "boundary_tolerance_output_cells": 1,
    "scope": "Full neatline alpha coverage only; not geographic acceptance.",
}
a.out.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
raise SystemExit(0 if receipt["passed"] else 1)
