"""Derive held-out headland check points from the engraving.

    python3 -m tools.church.headland_checks inverness north \
        --source work/inverness-master.tif \
        --vrt work/w-unclipped/inverness/inverness-north-gcp.vrt \
        --water reference/nstdb-major-water.geojson \
        --candidates tools/church/checks/inverness-north-candidates.csv \
        --out tools/church/checks/inverness-north.csv \
        --audit reports/church/headlands-north.json --qa qa/headlands-north.png

`drawn_checks.py` does this for islands, where both sides of a residual are a
shoelace centroid. This does it for headlands, where both sides are the point
furthest from the chord joining the ends of its own stretch of coast. Same rule
on both sides is what makes the comparison honest; it is also the only thing that
gives the north panel a measurement at all, since that coast carries almost no
islands and its extremal rules all name the same vertex.

`--check` asserts the committed check CSV still matches what the scan produces,
the guarantee `emit_gcps --check` already gives the control file. It CANNOT run
in CI: it needs the 3.5 GB scan and the 16 MB reference, neither of which is in
the repository. Run it on the compute host after any change to the detector or
its settings.

The QA sheet is not optional. This detector locks onto the boundary of a paper
fill, and a lake, a wide river or the edge of a hachure field are all paper with
a shoreline. Every accepted point in the committed CSV was looked at on the sheet
this writes.
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib

import cv2
import numpy as np

from tools.church.checksheet import inverse_transform
from tools.church.chords import Plane, geographic_plane
from tools.church.drawn import (
    SOURCE_METRES_PER_PIXEL,
    dilated,
    format_check_rows,
    ink_mask,
    refuse_duplicate_matches,
    tile_origin,
)
from tools.church.emit_candidates import (
    HEADLAND_RULE,
    parse_candidate_csv,
    resolve_headland_feature,
)
from tools.church.geometry import lonlat_to_mercator
from tools.church.gcps import load_gcps
from tools.church.headlands import (
    graticule_segments,
    headlands_in,
    merge_opposing_faces,
    segment_pixels,
    select_headland,
)
from tools.church.panels import get_panel
from tools.church.rasters import block_min_reduce

PATH_COLOUR = (0, 160, 0)
PREDICTION_COLOUR = (255, 0, 0)
TIP_COLOUR = (0, 0, 255)
CONSIDERED_COLOUR = (0, 140, 255)
REJECTED_COLOUR = (0, 0, 255)

def _tile_for(box, settings) -> int:
    """Tile side in source pixels covering the same ground as a candidate's box.

    The larger of the box's two sides, so a tall narrow box still gets a tile
    holding all of it. Clamped both ways: below `min_tile_px` a window cannot
    carry a chord at all, and above `tile_px` the paper fill costs more time and
    memory than the panel is worth.
    """
    plane = geographic_plane((box.south + box.north) / 2.0)
    width_m = (box.east - box.west) * plane.x_metres
    height_m = (box.north - box.south) * plane.y_metres
    side_px = max(width_m, height_m) / SOURCE_METRES_PER_PIXEL
    return int(min(settings.tile_px, max(settings.min_tile_px, math.ceil(side_px))))


def measure(
    county: str,
    panel_slug: str,
    source: str,
    vrt: pathlib.Path,
    water: pathlib.Path,
    candidates: pathlib.Path,
    control: pathlib.Path | None = None,
) -> list[dict]:
    """Read every headland candidate's drawn tip off the scan."""
    from osgeo import gdal

    panel = get_panel(county, panel_slug)
    settings = panel.headland_checks
    if settings is None:
        raise ValueError(f"{county}/{panel_slug} has no versioned headland settings")

    rows = parse_candidate_csv(candidates.read_text(encoding="utf-8"))
    features = json.loads(water.read_text(encoding="utf-8"))["features"]
    sheet_segments = graticule_segments(load_gcps(control)) if control else []

    dataset = gdal.Open(source)
    sheet_width, sheet_height = dataset.RasterXSize, dataset.RasterYSize
    dataset = None

    results: list[dict] = []
    for row in rows:
        if row.rule != HEADLAND_RULE:
            continue
        try:
            results.append((row, resolve_headland_feature(row, features)))
        except ValueError as error:
            results.append((row, None))
            print(f"  {row.label}: {error}")

    usable = [(row, found) for row, found in results if found is not None]
    mercator = [lonlat_to_mercator(found.lon, found.lat) for _, found in usable]
    predicted = inverse_transform(vrt, mercator) if mercator else []

    records: list[dict] = [
        {
            "label": row.label,
            "accepted": False,
            "reason": "the modern side refused; there is nothing to compare against",
        }
        for row, found in results
        if found is None
    ]

    # A reduced pixel is `factor` source pixels across, in both axes. Positive y
    # runs DOWN the page here; the sign of a deviation follows the direction the
    # boundary was walked either way, and `select_headland` compares magnitudes.
    reduced_metres = SOURCE_METRES_PER_PIXEL * settings.factor
    plane = Plane(x_metres=reduced_metres, y_metres=reduced_metres)

    for (row, found), (local_x, local_y) in zip(usable, predicted):
        sheet_x = local_x + panel.window.x
        sheet_y = local_y + panel.window.y

        # The tile comes from this candidate's OWN box, so the drawn tip and the
        # modern tip are measured against chords spanning the same stretch of
        # coast. A chord is defined by what it spans; measure one side over 8 km
        # and the other over 2 km and the ratio reports disagreement that is
        # really just two different baselines.
        tile_px = _tile_for(row.box, settings)
        origin_x = tile_origin(sheet_x, tile_px, sheet_width)
        origin_y = tile_origin(sheet_y, tile_px, sheet_height)
        tile = block_min_reduce(
            source, settings.factor, (origin_x, origin_y, tile_px, tile_px)
        )

        mask = dilated(ink_mask(tile, settings.darkness), settings.dilate_px)

        # The graticule, in this tile's own reduced pixels. Only segments that
        # actually reach the tile are rasterised - the mesh spans the whole sheet
        # and marking all of it would cost more than the fill it protects.
        local = []
        for (x0, y0), (x1, y1) in sheet_segments:
            ax, ay = (x0 - origin_x) / settings.factor, (y0 - origin_y) / settings.factor
            bx, by = (x1 - origin_x) / settings.factor, (y1 - origin_y) / settings.factor
            if max(ax, bx) < 0 or min(ax, bx) > mask.width:
                continue
            if max(ay, by) < 0 or min(ay, by) > mask.height:
                continue
            local.append(((ax, ay), (bx, by)))
        excluded = segment_pixels(
            local, settings.graticule_mask_px, mask.width, mask.height
        )

        faces = headlands_in(
            mask,
            min_area=int(settings.min_region_share * mask.width * mask.height),
            min_prominence_m=abs(found.prominence_m) * 0.5,
            plane=plane,
            excluded=excluded,
        )
        merged = merge_opposing_faces(faces)
        chosen = select_headland(
            merged,
            expected_prominence_m=abs(found.prominence_m),
            prediction=(
                (sheet_x - origin_x) / settings.factor,
                (sheet_y - origin_y) / settings.factor,
            ),
            radius_px=settings.search_radius_px / settings.factor,
        )

        record = {
            "label": row.label,
            "lon": found.lon,
            "lat": found.lat,
            "modern_prominence_m": found.prominence_m,
            "modern_runner_up_m": found.runner_up_m,
            "modern_run_vertices": found.run_length,
            "predicted_sheet_x": sheet_x,
            "predicted_sheet_y": sheet_y,
            "tile_origin": [origin_x, origin_y],
            "tile_px": tile_px,
            "reduce_factor": settings.factor,
            "graticule_segments_in_tile": len(local),
            "faces_found": len(faces),
            "features_after_merge": len(merged),
            "considered": chosen.considered,
            "reason": chosen.reason,
            "accepted": chosen.candidate is not None,
            "inside_cutline": panel.draws(sheet_x, sheet_y),
        }
        if chosen.candidate is not None:
            tip = chosen.candidate
            record["pixel_x"] = origin_x + tip.x * settings.factor
            record["pixel_y"] = origin_y + tip.y * settings.factor
            record["drawn_prominence_m"] = tip.prominence_m
            record["prominence_ratio"] = chosen.prominence_ratio
            record["runner_up_prominence_ratio"] = chosen.runner_up_prominence_ratio
            record["offset_from_prediction_px"] = chosen.distance_px * settings.factor
            record["sides"] = tip.sides
            record["drawn_path_vertices"] = tip.path_length
        # Every shoreline considered, accepted or not. A rejected tile is where
        # the interesting information is - "no headland of the right prominence"
        # says nothing about WHAT the detector traced, and the answer on this
        # panel turned out to be that the paper fill runs up the river mouths.
        record["_paths"] = tuple(p for candidate in merged for p in candidate.paths)
        record["_tips"] = tuple((c.x, c.y, c.prominence_m) for c in merged)
        record["_tile"] = tile
        records.append(record)
    return refuse_duplicate_matches(records)


def qa_sheet(results: list[dict], columns: int, scale: int) -> "np.ndarray":
    """Contact sheet showing what the detector actually locked onto.

    Green is the traced shoreline it measured, blue the transform's prediction,
    red the tip it recorded. A wrong lock is obvious at a glance: the green line
    runs around a lake, a river bend or the edge of a hachure field instead of
    the sea.
    """
    tiles = []
    for record in results:
        tile = record.get("_tile")
        if tile is None:
            continue
        image = cv2.cvtColor(tile[::scale, ::scale].copy(), cv2.COLOR_GRAY2BGR)
        origin_x, origin_y = record["tile_origin"]
        # Paths and tips arrive in reduced tile pixels; the sheet coordinates in
        # the record are in source pixels. `scale` thins the image again for the
        # contact sheet, so both divisions are needed.
        factor = record["reduce_factor"]

        for path in record.get("_paths", ()):
            points = np.array(
                [[int(x / scale), int(y / scale)] for x, y in path], dtype=np.int32
            )
            cv2.polylines(image, [points], False, PATH_COLOUR, 2)

        for tip_x, tip_y, prominence in record.get("_tips", ()):
            cv2.drawMarker(
                image,
                (int(tip_x / scale), int(tip_y / scale)),
                CONSIDERED_COLOUR,
                cv2.MARKER_DIAMOND,
                18,
                2,
            )

        px = int((record["predicted_sheet_x"] - origin_x) / factor / scale)
        py = int((record["predicted_sheet_y"] - origin_y) / factor / scale)
        cv2.drawMarker(image, (px, py), PREDICTION_COLOUR, cv2.MARKER_CROSS, 30, 2)

        if record.get("accepted"):
            cx = int((record["pixel_x"] - origin_x) / factor / scale)
            cy = int((record["pixel_y"] - origin_y) / factor / scale)
            cv2.drawMarker(image, (cx, cy), TIP_COLOUR, cv2.MARKER_TILTED_CROSS, 24, 2)
            caption = (
                f"{record['label'][:24]}  prom x{record['prominence_ratio']:.2f}"
                f"  {record['sides']} side(s)"
                f"  d={record['offset_from_prediction_px']:.0f}px"
            )
            colour = PATH_COLOUR
        else:
            caption = f"{record['label'][:24]}  REJECTED"
            colour = REJECTED_COLOUR

        side = image.shape[0]
        cv2.rectangle(image, (0, 0), (image.shape[1] - 1, side - 1), (0, 0, 0), 2)
        cv2.putText(image, caption, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 2)
        if not record.get("accepted"):
            cv2.putText(
                image, record["reason"][:56], (8, side - 12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, colour, 1,
            )
        tiles.append(image)

    if not tiles:
        return np.zeros((10, 10, 3), np.uint8)

    # Tiles differ in size because each is cut to its own candidate's box, so
    # they are scaled to a common cell rather than stacked raw. Scaled, not
    # padded: a 2,943 px tile beside a 656 px one would otherwise render the
    # small one as a stamp in a field of grey, and the whole point of the sheet
    # is that a wrong lock is obvious at a glance.
    cell = max(max(image.shape[:2]) for image in tiles)
    cells = [
        cv2.resize(image, (cell, cell), interpolation=cv2.INTER_AREA)
        for image in tiles
    ]
    grid = []
    for start in range(0, len(cells), columns):
        chunk = cells[start : start + columns]
        while len(chunk) < columns:
            chunk.append(np.full_like(cells[0], 245))
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
    parser.add_argument(
        "--control",
        type=pathlib.Path,
        help="control GCP CSV, whose points are the engraved graticule intersections",
    )
    parser.add_argument("--out", type=pathlib.Path, help="check CSV to write")
    parser.add_argument("--audit", type=pathlib.Path, help="per-candidate JSON record")
    parser.add_argument("--qa", type=pathlib.Path, help="contact sheet to write")
    parser.add_argument("--qa-columns", type=int, default=3)
    parser.add_argument("--qa-scale", type=int, default=2)
    parser.add_argument(
        "--check",
        action="store_true",
        help="assert --out already matches what the scan produces, and change nothing",
    )
    args = parser.parse_args(argv)

    results = measure(
        args.county, args.panel, args.source, args.vrt, args.water, args.candidates,
        args.control,
    )

    accepted = [r for r in results if r.get("accepted")]
    print(f"{len(accepted)} of {len(results)} candidates yielded a drawn headland")
    for record in results:
        if record.get("accepted"):
            print(
                f"  OK   {record['label']:<28} prom x{record['prominence_ratio']:.2f}"
                f"  {record['sides']} side(s)"
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
