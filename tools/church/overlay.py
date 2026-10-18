"""Composite a warped Church panel against authoritative modern water.

    python3 -m tools.church.overlay warps/inverness-north-3857.tif \
        reference/nstdb-major-water.geojson qa/north.png --factor 16

Modern water is tinted over the historical raster and its edge drawn in red. If
the georeferencing is good, Church's drawn shoreline hugs the red line; where it
does not, the gap IS the error and can be measured straight off the image.

This is the visual half of QA. The numeric half is `shoreline_error.py`, and
neither replaces held-out check points - both look only at coastline, and a warp
can register a coast well while shearing the interior.

Needs GDAL, OpenCV, and ogr2ogr/gdal_rasterize on PATH.
"""

from __future__ import annotations

import argparse
import pathlib
import subprocess
import tempfile

import cv2
import numpy as np
from osgeo import gdal

from tools.church.rasters import read_reduced_rgba, reduced_extent

gdal.UseExceptions()


def rasterize_reference(
    vector: str,
    extent: tuple[float, float, float, float],
    size: tuple[int, int],
    directory: pathlib.Path,
    where: str | None = None,
) -> np.ndarray:
    """Burn a reference vector layer onto the panel's own grid."""
    directory.mkdir(parents=True, exist_ok=True)
    reprojected = directory / "reference.gpkg"
    command = ["ogr2ogr", "-t_srs", "EPSG:3857", "-f", "GPKG", str(reprojected), vector]
    if where:
        command += ["-where", where]
    subprocess.run(command, check=True, capture_output=True)

    burned = directory / "reference.tif"
    xmin, ymin, xmax, ymax = extent
    subprocess.run(
        [
            "gdal_rasterize", "-burn", "255", "-ot", "Byte", "-init", "0",
            "-te", str(xmin), str(ymin), str(xmax), str(ymax),
            "-ts", str(size[0]), str(size[1]),
            str(reprojected), str(burned),
        ],
        check=True,
        capture_output=True,
    )
    return cv2.imread(str(burned), cv2.IMREAD_GRAYSCALE)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("warped")
    parser.add_argument("reference")
    parser.add_argument("out", type=pathlib.Path)
    parser.add_argument("--factor", type=int, default=16)
    parser.add_argument("--where", default=None, help="OGR attribute filter")
    args = parser.parse_args(argv)

    dataset = gdal.Open(args.warped)
    grey, alpha = read_reduced_rgba(dataset, args.factor)
    height, width = grey.shape

    with tempfile.TemporaryDirectory() as directory:
        reference = rasterize_reference(
            args.reference,
            reduced_extent(dataset, args.factor),
            (width, height),
            pathlib.Path(directory),
            args.where,
        )

    image = cv2.cvtColor(grey, cv2.COLOR_GRAY2BGR)
    # Uncovered area is drawn light rather than black, so a hole inside the
    # panel reads as a hole and not as a dense patch of ink.
    image[alpha == 0] = (245, 245, 245)

    tint = np.zeros_like(image)
    tint[reference > 0] = (200, 90, 0)
    image = np.where(
        reference[..., None] > 0, cv2.addWeighted(image, 0.68, tint, 0.32, 0), image
    )
    edges = cv2.dilate(cv2.Canny(reference, 50, 150), np.ones((2, 2), np.uint8))
    image[edges > 0] = (0, 0, 255)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.out), image)
    xmin, ymin, xmax, ymax = reduced_extent(dataset, args.factor)
    print(
        f"wrote {args.out} ({width}x{height}) "
        f"extent {xmin:.0f},{ymin:.0f} .. {xmax:.0f},{ymax:.0f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
