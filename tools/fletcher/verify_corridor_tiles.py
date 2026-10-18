"""Compare actual corridor tiles with one continuous GDAL render and the road line.

Run with a Python environment containing GDAL and NumPy. Coverage checks do not
change the recorded geographic accuracy or the accepted southern sheet offset.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from osgeo import gdal

gdal.UseExceptions()
p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--tiles", type=Path, required=True)
p.add_argument("--source", type=Path, required=True)
p.add_argument("--coverage-line", type=Path, required=True)
p.add_argument("--out", type=Path, required=True)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
metadata = json.loads((a.tiles / "source.json").read_text())
assert (
    hashlib.sha256(a.source.read_bytes()).hexdigest() == metadata["sourceRasterSha256"]
)
# Every tile intersecting the raster rectangle must exist, even if transparent.
west, south, east, north = metadata["bounds"]
for z in range(8, 16):

    def xy(lon, lat, z=z):
        return (
            (lon + 180) / 360 * 2**z,
            (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2**z,
        )

    x0, y0 = map(math.floor, xy(west, north))
    x1, y1 = map(math.floor, xy(east, south))
    expected = {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
    actual = {
        (int(f.parent.name), int(f.stem)) for f in (a.tiles / str(z)).glob("*/*.png")
    }
    assert actual == expected, (z, len(expected - actual), len(actual - expected))
# x0 etc now describe zoom 15. Assemble without resampling, retaining tile edges.
resolution = 2 * math.pi * 6378137 / (256 * 2**15)
origin = math.pi * 6378137
left = x0 * 256 * resolution - origin
top = origin - y0 * 256 * resolution
width = (x1 - x0 + 1) * 256
height = (y1 - y0 + 1) * 256
tiled = np.zeros((4, height, width), dtype=np.uint8)
for x, y in actual:
    tile = gdal.Open(str(a.tiles / "15" / str(x) / f"{y}.png")).ReadAsArray()
    assert tile.shape == (4, 256, 256)
    tiled[
        :, (y - y0) * 256 : (y - y0 + 1) * 256, (x - x0) * 256 : (x - x0 + 1) * 256
    ] = tile
bounds = [left, top - height * resolution, left + width * resolution, top]
reference = gdal.Warp(
    "",
    str(a.source),
    format="MEM",
    outputBounds=bounds,
    width=width,
    height=height,
    dstSRS="EPSG:3857",
    resampleAlg="bilinear",
    srcAlpha=True,
    dstAlpha=True,
)
ref = reference.ReadAsArray()
road = gdal.Rasterize(
    "",
    str(a.coverage_line),
    format="MEM",
    outputBounds=bounds,
    width=width,
    height=height,
    outputSRS="EPSG:3857",
    burnValues=[1],
    allTouched=True,
    outputType=gdal.GDT_Byte,
)
road_mask = road.ReadAsArray() != 0
missing = int(np.count_nonzero(road_mask & (tiled[3] == 0)))
assert missing == 0, missing
edge = np.zeros((height, width), dtype=bool)
edge[255::256] = True
edge[256::256] = True
edge[:, 255::256] = True
edge[:, 256::256] = True
opaque = (ref[3] == 255) & (tiled[3] == 255)
difference = np.abs(tiled[:3].astype(np.int16) - ref[:3].astype(np.int16))
edge_values = difference[:, edge & opaque]
# Actual tile seams must not introduce transparent cuts through opaque source.
edge_holes = int(np.count_nonzero(edge & (ref[3] == 255) & (tiled[3] == 0)))
assert edge_holes == 0, edge_holes
interior = ref[3] == 255
for dy, dx in [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]:
    interior &= np.roll(np.roll(ref[3] == 255, dy, axis=0), dx, axis=1)
interior[:1] = False
interior[-1:] = False
interior[:, :1] = False
interior[:, -1:] = False
interior_holes = int(np.count_nonzero(edge & interior & (tiled[3] == 0)))
assert interior_holes == 0, interior_holes
assert not np.any(edge_values), "Tile boundary RGB differs from continuous reference"
assert not np.any(difference[:, opaque]), (
    "Opaque tiled pixels differ from continuous reference"
)
result = {
    "zoom": 15,
    "projectedPixelSizeM": resolution,
    "completeXYZRectangles": True,
    "referenceLineCells": int(road_mask.sum()),
    "transparentRoadCells": missing,
    "opaqueSourceBoundaryDifferencesAtCropEdges": edge_holes,
    "opaqueInteriorTileBoundaryHoles": interior_holes,
    "opaqueRGBMeanAbsoluteDifference": float(difference[:, opaque].mean()),
    "boundaryRGBMeanAbsoluteDifference": float(edge_values.mean()),
    "boundaryRGBMaxDifference": int(edge_values.max()),
    "comparison": "GDAL raster tile bilinear tiles versus a continuous GDAL bilinear render. Resampling differences are not geographic errors.",
    "sourceSha256": metadata["sourceRasterSha256"],
    "coverageLineSha256": hashlib.sha256(a.coverage_line.read_bytes()).hexdigest(),
}
(a.out / "verification.json").write_text(json.dumps(result, indent=2) + "\n")
# Native-output-resolution evidence spanning the southern join and tile edges.
lat, lon = 45.74742, -61.4635
cx = int((math.radians(lon) * 6378137 - left) / resolution)
cy = int((top - 6378137 * math.asinh(math.tan(math.radians(lat)))) / resolution)
for name, array in [("tiled", tiled), ("continuous-reference", ref)]:
    crop = array[:, cy - 160 : cy + 160, cx - 180 : cx + 180]
    mem = gdal.GetDriverByName("MEM").Create("", 360, 320, 4, gdal.GDT_Byte)
    for b in range(4):
        mem.GetRasterBand(b + 1).WriteArray(crop[b])
    mem.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
    gdal.GetDriverByName("PNG").CreateCopy(str(a.out / f"{name}-join.png"), mem)
print(json.dumps(result, indent=2))
