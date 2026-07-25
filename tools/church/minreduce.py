"""Block-minimum downsample of a Church scan to a browsable overview.

    python3 -m tools.church.minreduce work/inverness-master.tif work/sheet-min8.tif --factor 8

Needs GDAL. The reduction rule and its geometry live in `tools.church.blocks`,
which is pure stdlib and carries the tests.
"""

from __future__ import annotations

import argparse
import pathlib

from osgeo import gdal

from tools.church.rasters import block_min_reduce

gdal.UseExceptions()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source")
    parser.add_argument("out", type=pathlib.Path)
    parser.add_argument("--factor", type=int, default=8)
    args = parser.parse_args(argv)

    reduced = block_min_reduce(args.source, args.factor)
    height, width = reduced.shape
    driver = gdal.GetDriverByName("GTiff")
    dataset = driver.Create(
        str(args.out), width, height, 1, gdal.GDT_Byte, options=["COMPRESS=DEFLATE"]
    )
    dataset.GetRasterBand(1).WriteArray(reduced)
    dataset = None
    print(f"wrote {args.out} {width}x{height} (reduced by {args.factor})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
