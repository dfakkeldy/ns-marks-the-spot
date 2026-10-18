"""GDAL/OpenCV plumbing shared by the Church detection and QA tools.

Everything in this module touches a raster, so it needs GDAL and is NOT
importable in CI. It is deliberately thin: it reads pixels and hands them to
the pure modules (`blocks`, `linefit`, `lattice`, `distances`) that hold the
actual decisions and carry the tests.

If you are about to add an `if` to this file, it probably belongs next door.
"""

from __future__ import annotations

import numpy as np
from osgeo import gdal

from tools.church.blocks import reduced_shape, strip_plan

gdal.UseExceptions()

MAX_SOURCE_ROWS = 4096
"""Rows of source raster held in memory at once. The Inverness sheet is about
3.5 GB read whole, so it is read in bands instead."""


def block_min_reduce(
    source: str,
    factor: int,
    window: tuple[int, int, int, int] | None = None,
) -> np.ndarray:
    """Block-minimum reduce a raster, taking the darkest pixel across bands first.

    See `tools.church.blocks` for why minimum and not mean: averaging dilutes
    the 1-3 px printed graticule into the paper and detection never sees it.
    """
    dataset = gdal.Open(source)
    if window is None:
        offset_x, offset_y = 0, 0
        width, height = dataset.RasterXSize, dataset.RasterYSize
    else:
        offset_x, offset_y, width, height = window

    out_width, out_height = reduced_shape(width, height, factor)
    out = np.zeros((out_height, out_width), dtype=np.uint8)
    band_count = min(3, dataset.RasterCount)

    for strip in strip_plan(out_height, factor, MAX_SOURCE_ROWS):
        darkest = None
        for band in range(1, band_count + 1):
            rows = dataset.GetRasterBand(band).ReadAsArray(
                offset_x,
                offset_y + strip.source_y(factor),
                out_width * factor,
                strip.source_rows(factor),
            )
            darkest = rows if darkest is None else np.minimum(darkest, rows)
        out[strip.out_y : strip.out_y + strip.out_rows, :] = darkest.reshape(
            strip.out_rows, factor, out_width, factor
        ).min(axis=(1, 3))
    return out


def reduced_extent(dataset: "gdal.Dataset", factor: int) -> tuple[float, float, float, float]:
    """Georeferenced bounds of a raster as (xmin, ymin, xmax, ymax)."""
    transform = dataset.GetGeoTransform()
    xmin, ymax = transform[0], transform[3]
    xmax = xmin + transform[1] * dataset.RasterXSize
    ymin = ymax + transform[5] * dataset.RasterYSize
    return xmin, ymin, xmax, ymax


def read_reduced_rgba(
    dataset: "gdal.Dataset", factor: int
) -> tuple[np.ndarray, np.ndarray]:
    """Reduced greyscale ink and alpha coverage of a warped, alpha-bearing panel.

    Ink reduces by MINIMUM so a thin drawn coastline survives; alpha reduces by
    MAXIMUM so a block that holds any imagery counts as covered. Reducing alpha
    by minimum instead would erode the panel inward by a block on every edge and
    quietly discard the very boundary pixels a seam check is looking at.
    """
    out_width, out_height = reduced_shape(dataset.RasterXSize, dataset.RasterYSize, factor)
    grey = None
    for band in range(1, 4):
        rows = dataset.GetRasterBand(band).ReadAsArray(
            0, 0, out_width * factor, out_height * factor
        )
        rows = rows.reshape(out_height, factor, out_width, factor).min(axis=(1, 3))
        grey = rows if grey is None else np.minimum(grey, rows)

    alpha = dataset.GetRasterBand(4).ReadAsArray(
        0, 0, out_width * factor, out_height * factor
    )
    alpha = alpha.reshape(out_height, factor, out_width, factor).max(axis=(1, 3))
    return grey, alpha
