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
from tools.church.overlay import rasterize_reference
from tools.church.rasters import read_reduced_rgba, reduced_extent

gdal.UseExceptions()

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
