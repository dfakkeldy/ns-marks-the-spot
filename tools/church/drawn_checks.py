"""Derive held-out check points from the engraving instead of reading them by eye.

    python3 -m tools.church.drawn_checks inverness south \
        --source work/inverness-master.tif \
        --vrt work/w-unclipped/inverness/inverness-south-gcp.vrt \
        --water reference/nstdb-major-water.geojson \
        --candidates tools/church/checks/inverness-south-candidates.csv \
        --out tools/church/checks/inverness-south.csv \
        --audit reports/church/drawn-south.json --qa qa/drawn-south.png

Attempt 4 measured the south panel with pixel positions a person read off contact
sheets. This replaces that with a rule: threshold the ink, trace the closed
outline, take the shoelace centroid. The modern coordinate for the same island is
already a shoelace centroid, so both sides of every residual now come from the
same definition.

`--check` asserts the committed check CSV still matches what the scan produces,
the guarantee `emit_gcps --check` and `emit_candidates --check` already give the
control and candidate files. It CANNOT run in CI: it needs the 3.5 GB scan and
the 16 MB reference, neither of which is in the repository. Run it on the compute
host after any change to the detector or its settings.

The QA sheet is not optional. A detector that locks onto a neighbouring island or
a name label is worse than an eyeball, because it is confidently wrong at scale.
Every accepted point in the committed CSV was looked at on the sheet this writes.
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib

import cv2
import numpy as np

from tools.church.checksheet import inverse_transform
from tools.church.drawn import (
    dilated,
    format_check_rows,
    ink_mask,
    refuse_duplicate_matches,
    select_shape,
    shape_signature,
    shapes_in,
    square_degrees_to_pixel_area,
    tile_origin,
)
from tools.church.emit_candidates import ISLAND_RULE, parse_candidate_csv
from tools.church.geometry import lonlat_to_mercator
from tools.church.landmarks import islands_within
from tools.church.panels import get_panel
from tools.church.paper_islands import paper_islands_in, select_paper_island
from tools.church.rasters import block_min_reduce

RING_COLOUR = (0, 160, 0)
PREDICTION_COLOUR = (255, 0, 0)
CENTROID_COLOUR = (0, 0, 255)
REJECTED_COLOUR = (0, 0, 255)


def _resolve_island(row, features: list[dict]):
    """The modern island a candidate names, with the area its size filter needs."""
    islands = islands_within(features, row.box)
    if not islands:
        raise ValueError(f"{row.label}: no island centroid inside {row.box}")
    return islands[0]


def measure(
    county: str,
    panel_slug: str,
    source: str,
    vrt: pathlib.Path,
    water: pathlib.Path,
    candidates: pathlib.Path,
) -> list[dict]:
    """Read every island candidate's drawn centroid off the scan."""
    from osgeo import gdal

    panel = get_panel(county, panel_slug)
    settings = panel.drawn_checks
    if settings is None:
        raise ValueError(f"{county}/{panel_slug} has no versioned drawn-check settings")

    rows = parse_candidate_csv(candidates.read_text(encoding="utf-8"))
    features = json.loads(water.read_text(encoding="utf-8"))["features"]

    dataset = gdal.Open(source)
    sheet_width, sheet_height = dataset.RasterXSize, dataset.RasterYSize
    dataset = None

    island_rows = [row for row in rows if row.rule == ISLAND_RULE]
    skipped = [row for row in rows if row.rule != ISLAND_RULE]

    resolved = []
    for row in island_rows:
        try:
            resolved.append((row, _resolve_island(row, features)))
        except ValueError as error:
            resolved.append((row, None))
            print(f"  {row.label}: {error}")

    usable = [(row, island) for row, island in resolved if island is not None]
    mercator = [lonlat_to_mercator(island.lon, island.lat) for _, island in usable]
    predicted = inverse_transform(vrt, mercator) if mercator else []

    results: list[dict] = []
    for row in skipped:
        results.append(
            {
                "label": row.label,
                "accepted": False,
                "reason": f"rule {row.rule!r} names a vertex, not an area; only "
                f"{ISLAND_RULE!r} candidates have a centroid to compare",
            }
        )

    for (row, island), (local_x, local_y) in zip(usable, predicted):
        sheet_x = local_x + panel.window.x
        sheet_y = local_y + panel.window.y
        expected_area = square_degrees_to_pixel_area(island.area_sq_deg, island.lat)
        # Put the modern ring in a locally-metric, north-up frame before asking
        # its shape: longitude is compressed by cos(lat) at this latitude, and
        # comparing degrees directly would call every island the wrong shape.
        expected_elongation, expected_orientation = shape_signature(
            list(island.ring), x_scale=math.cos(math.radians(island.lat)), y_scale=1.0
        )

        origin_x = tile_origin(sheet_x, settings.tile_px, sheet_width)
        origin_y = tile_origin(sheet_y, settings.tile_px, sheet_height)
        tile = block_min_reduce(
            source, 1, (origin_x, origin_y, settings.tile_px, settings.tile_px)
        )

        mask = dilated(ink_mask(tile, settings.darkness), settings.dilate_px)
        if settings.reader == "ink-outline":
            shapes = shapes_in(mask, settings.min_ink_px)
            chosen = select_shape(
                shapes,
                expected_area_px=expected_area,
                prediction=(sheet_x - origin_x, sheet_y - origin_y),
                radius_px=settings.search_radius_px,
            )
        elif settings.reader == "enclosed-paper":
            shapes = paper_islands_in(mask, settings.min_ink_px)
            chosen = select_paper_island(
                shapes,
                expected_area_px=expected_area,
                prediction=(sheet_x - origin_x, sheet_y - origin_y),
                radius_px=settings.search_radius_px,
            )
        else:
            raise ValueError(
                f"{county}/{panel_slug} has unknown drawn-check reader "
                f"{settings.reader!r}"
            )

        record = {
            "label": row.label,
            "lon": island.lon,
            "lat": island.lat,
            "modern_area_px": expected_area,
            "modern_elongation": expected_elongation,
            "modern_orientation_deg": expected_orientation,
            "predicted_sheet_x": sheet_x,
            "predicted_sheet_y": sheet_y,
            "tile_origin": [origin_x, origin_y],
            "shapes_found": len(shapes),
            "considered": chosen.considered,
            "reason": chosen.reason,
            "accepted": chosen.shape is not None,
            "inside_cutline": panel.draws(sheet_x, sheet_y),
            "reader": settings.reader,
        }
        if chosen.shape is not None:
            record["pixel_x"] = chosen.shape.centroid_x + origin_x
            record["pixel_y"] = chosen.shape.centroid_y + origin_y
            record["drawn_area_px"] = chosen.shape.enclosed_area
            record["area_ratio"] = chosen.area_ratio
            record["drawn_elongation"] = chosen.shape.elongation
            record["drawn_orientation_deg"] = chosen.shape.orientation_deg
            if settings.reader == "ink-outline":
                record["fill_ratio"] = chosen.shape.fill_ratio
            record["runner_up_area_ratio"] = chosen.runner_up_area_ratio
            record["offset_from_prediction_px"] = chosen.distance_px
            record["_ring"] = chosen.shape.ring
        record["_tile"] = tile
        results.append(record)
    return refuse_duplicate_matches(results)


def qa_sheet(results: list[dict], columns: int, scale: int) -> "np.ndarray":
    """Contact sheet showing what the detector actually locked onto.

    Green is the traced outline it chose, blue the transform's prediction, red
    the centroid it recorded. A wrong lock is obvious at a glance: the green ring
    sits on a hill, a lake or a word instead of an island.
    """
    tiles = []
    for record in results:
        tile = record.get("_tile")
        if tile is None:
            continue
        image = cv2.cvtColor(tile[::scale, ::scale].copy(), cv2.COLOR_GRAY2BGR)
        origin_x, origin_y = record["tile_origin"]

        ring = record.get("_ring")
        if ring:
            points = np.array(
                [[int(x / scale), int(y / scale)] for x, y in ring], dtype=np.int32
            )
            cv2.polylines(image, [points], True, RING_COLOUR, 2)

        px = int((record["predicted_sheet_x"] - origin_x) / scale)
        py = int((record["predicted_sheet_y"] - origin_y) / scale)
        cv2.drawMarker(image, (px, py), PREDICTION_COLOUR, cv2.MARKER_CROSS, 30, 2)

        if record.get("accepted"):
            cx = int((record["pixel_x"] - origin_x) / scale)
            cy = int((record["pixel_y"] - origin_y) / scale)
            cv2.drawMarker(image, (cx, cy), CENTROID_COLOUR, cv2.MARKER_TILTED_CROSS, 24, 2)
            caption = (
                f"{record['label'][:26]}  area x{record['area_ratio']:.2f}"
                f"  d={record['offset_from_prediction_px']:.0f}px"
            )
            colour = RING_COLOUR
        else:
            caption = f"{record['label'][:26]}  REJECTED"
            colour = REJECTED_COLOUR

        side = image.shape[0]
        cv2.rectangle(image, (0, 0), (image.shape[1] - 1, side - 1), (0, 0, 0), 2)
        cv2.putText(image, caption, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 2)
        if not record.get("accepted"):
            cv2.putText(
                image, record["reason"][:52], (8, side - 12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, colour, 1,
            )
        tiles.append(image)

    if not tiles:
        return np.zeros((10, 10, 3), np.uint8)
    grid = []
    for start in range(0, len(tiles), columns):
        chunk = tiles[start : start + columns]
        while len(chunk) < columns:
            chunk.append(np.full_like(tiles[0], 245))
        grid.append(np.hstack(chunk))
    return np.vstack(grid)


def _header_of(text: str) -> str:
    leading = []
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            leading.append(line)
        elif line.strip():
            break
    return "\n".join(leading)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("county")
    parser.add_argument("panel")
    parser.add_argument("--source", required=True)
    parser.add_argument("--vrt", type=pathlib.Path, required=True)
    parser.add_argument("--water", type=pathlib.Path, required=True)
    parser.add_argument("--candidates", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, help="check CSV to write")
    parser.add_argument("--audit", type=pathlib.Path, help="per-candidate JSON record")
    parser.add_argument("--qa", type=pathlib.Path, help="contact sheet to write")
    parser.add_argument("--qa-columns", type=int, default=4)
    parser.add_argument("--qa-scale", type=int, default=2)
    parser.add_argument(
        "--check",
        action="store_true",
        help="assert --out already matches what the scan produces, and change nothing",
    )
    args = parser.parse_args(argv)

    results = measure(
        args.county, args.panel, args.source, args.vrt, args.water, args.candidates
    )

    accepted = [r for r in results if r.get("accepted")]
    print(f"{len(accepted)} of {len(results)} candidates yielded a drawn centroid")
    for record in results:
        if record.get("accepted"):
            print(
                f"  OK   {record['label']:<28} area x{record['area_ratio']:.2f}"
                f"  runner-up x{record['runner_up_area_ratio'] or float('nan'):.2f}"
                f"  {record['offset_from_prediction_px']:.0f} px from prediction"
            )
        else:
            print(f"  SKIP {record['label']:<28} {record['reason']}")

    if args.qa:
        args.qa.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(args.qa), qa_sheet(results, args.qa_columns, args.qa_scale))
        print(f"QA contact sheet -> {args.qa}  (LOOK AT IT before trusting any row)")

    if args.audit:
        args.audit.parent.mkdir(parents=True, exist_ok=True)
        args.audit.write_text(
            json.dumps(
                [
                    {k: v for k, v in record.items() if not k.startswith("_")}
                    for record in results
                ],
                indent=1,
            ),
            encoding="utf-8",
        )
        print(f"audit -> {args.audit}")

    if args.out:
        existing = args.out.read_text(encoding="utf-8") if args.out.exists() else ""
        rendered = format_check_rows(results, header=_header_of(existing))
        if args.check:
            if rendered != existing:
                print(f"{args.out} does not match what the scan produces")
                return 1
            print(f"{args.out}: {len(accepted)} check points match the engraving")
            return 0
        args.out.write_text(rendered, encoding="utf-8")
        print(f"wrote {args.out} ({len(accepted)} check points)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
