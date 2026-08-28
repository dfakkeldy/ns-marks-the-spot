"""Distance from the modern shoreline to the nearest historical ink.

    python3 -m tools.church.shoreline_error warps/inverness-north-3857.tif \
        reference/nstdb-major-water.geojson --out reports/shoreline-north.json

Sampled at every modern shoreline pixel that falls inside the warped panel.

This is a LOWER BOUND on shoreline error: any ink counts, so dense hachure or
lettering near a coast flatters it. It is not the accuracy figure - held-out
physical check points are. Its value is coverage and its SPATIAL breakdown: a
warp that has failed in one corner shows as one bad band while the aggregate
still looks respectable.

Two masks matter for interpreting the tail, and both are off by default because
each one narrows what is being measured and that must be a deliberate choice:

  --where   restrict the reference to the outer sea/land boundary, so inland
            lakes stop contributing.
  --clip    restrict sampling to what Church actually mapped. Where he drew
            blank "Barren" highland and modern data carries lakes, distance to
            nearest ink is large but the cause is absence of drawn data, not
            misregistration.

Statistics live in `tools.church.distances`, which is pure stdlib and tested.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import tempfile

import cv2
import numpy as np
from osgeo import gdal

from tools.church.distances import summarise_distances
from tools.church.geometry import lonlat_to_mercator
from tools.church.landmarks import vertices_of
from tools.church.overlay import rasterize_reference
from tools.church.rasters import read_reduced_rgba, reduced_extent
from tools.church.walls import ExtractWalls, detect_extract_walls

gdal.UseExceptions()


def reference_vertices(path: str) -> list[tuple[float, float]]:
    """Every vertex in a GeoJSON reference, for seam detection."""
    data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    found: list[tuple[float, float]] = []
    for feature in data.get("features", []):
        found += vertices_of(feature.get("geometry") or {})
    return found


def seam_mask(
    walls: ExtractWalls, extent: tuple[float, float, float, float], size: tuple[int, int]
) -> np.ndarray:
    """Raster mask of the columns and rows a clip seam runs along.

    Blunt on purpose: a seam is axis-aligned in geographic coordinates, so it
    lands on one column or row of this grid, and masking three pixels of it
    covers the burnt line's half-pixel straddle. Real shoreline crossing that
    exact longitude loses a few samples out of thousands, whereas leaving the
    seam in contributes its entire length at open-sea range.
    """
    width, height = size
    xmin, ymin, xmax, ymax = extent
    mask = np.zeros((height, width), bool)
    for lon in walls.longitudes:
        column = int(round((lonlat_to_mercator(lon, 0.0)[0] - xmin) / ((xmax - xmin) / width)))
        low, high = max(0, column - 1), min(width, column + 2)
        if low < high:
            mask[:, low:high] = True
    for lat in walls.latitudes:
        row = int(round((ymax - lonlat_to_mercator(0.0, lat)[1]) / ((ymax - ymin) / height)))
        low, high = max(0, row - 1), min(height, row + 2)
        if low < high:
            mask[low:high, :] = True
    return mask

EDGE_EXCLUSION_PX = 25
"""Stay this far inside the alpha boundary when sampling. A panel edge is a
cliff in the distance field - the nearest ink is simply outside - and sampling
across it would measure the crop, not the georeferencing."""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("warped")
    parser.add_argument("reference")
    parser.add_argument("--factor", type=int, default=4)
    parser.add_argument("--ink", type=int, default=150)
    parser.add_argument("--bands", type=int, default=4)
    parser.add_argument("--where", default=None, help="OGR attribute filter")
    parser.add_argument(
        "--clip",
        default=None,
        help="polygon layer limiting where samples are taken, e.g. the county Church mapped",
    )
    parser.add_argument(
        "--keep-extract-seams",
        action="store_true",
        help="count the straight seams where the reference extract was tiled as if "
        "they were shoreline. They are not, and they run through open sea where "
        "nothing was drawn; this exists only to reproduce pre-2026-07-25 numbers",
    )
    parser.add_argument("--label", default=None, help="name recorded in the report")
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    dataset = gdal.Open(args.warped)
    transform = dataset.GetGeoTransform()
    metres_per_sample = abs(transform[1]) * args.factor
    grey, alpha = read_reduced_rgba(dataset, args.factor)
    height, width = grey.shape
    extent = reduced_extent(dataset, args.factor)

    with tempfile.TemporaryDirectory() as directory:
        root = pathlib.Path(directory)
        water = rasterize_reference(
            args.reference, extent, (width, height), root / "water", args.where
        )
        clip = (
            rasterize_reference(args.clip, extent, (width, height), root / "clip")
            if args.clip
            else None
        )

    ink = ((grey < args.ink) & (alpha > 0)).astype(np.uint8)
    if not ink.any():
        raise SystemExit("no historical ink found inside the panel")
    distance = cv2.distanceTransform(1 - ink, cv2.DIST_L2, 5) * metres_per_sample

    inside = cv2.erode(
        (alpha > 0).astype(np.uint8),
        np.ones((EDGE_EXCLUSION_PX, EDGE_EXCLUSION_PX), np.uint8),
    )
    sample = (cv2.Canny(water, 50, 150) > 0) & (inside > 0)
    if clip is not None:
        sample &= clip > 0

    seam_count = 0
    if not args.keep_extract_seams:
        walls = detect_extract_walls(reference_vertices(args.reference))
        if walls.any:
            on_seam = seam_mask(walls, extent, (width, height))
            seam_count = int((sample & on_seam).sum())
            sample &= ~on_seam

    rows = np.where(sample)[0]
    values = distance[sample]
    if values.size == 0:
        raise SystemExit("no shoreline samples inside the panel")

    summary = summarise_distances(
        [float(value) for value in values],
        band_of=[int(row * args.bands // height) for row in rows],
        band_count=args.bands,
    )
    report = {
        "label": args.label or pathlib.Path(args.warped).stem,
        "warped": args.warped,
        "reference": args.reference,
        "where": args.where,
        "clip": args.clip,
        "metres_per_sample_px": metres_per_sample,
        "extract_seam_samples_dropped": seam_count,
        "kept_extract_seams": bool(args.keep_extract_seams),
        **summary.as_dict(),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(json.dumps(report, indent=1))

    heat = cv2.applyColorMap(
        np.clip(distance / 1000.0 * 255, 0, 255).astype(np.uint8), cv2.COLORMAP_TURBO
    )
    heat[~sample] = (30, 30, 30)
    cv2.imwrite(str(args.out.with_suffix("")) + "-heat.png", heat)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
