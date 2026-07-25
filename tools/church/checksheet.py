"""Contact sheet of candidate check-point locations on the archival scan.

    python3 -m tools.church.checksheet inverness north \
        --source work/inverness-master.tif \
        --vrt work/w-clipped/inverness/inverness-north-gcp.vrt \
        --candidates reports/north-candidates.csv --out qa/north-checksheet.png

Held-out check points need two coordinates each: a modern one, which
`landmarks.py` derives by an objective rule from NSTDB geometry, and a pixel
one, which a person has to find on the scan by eye. This tool makes the second
part tractable at the scale the acceptance gate needs.

For every candidate it pushes the modern coordinate BACKWARDS through the
panel's own thin-plate spline to guess a pixel, crops a tile there, marks the
guess with a crosshair, and tiles the results into one image.

What the crosshair is and is not
--------------------------------
It is a place to look. It is NOT the answer, and it must never be recorded as
one: the guess comes from the very transform being tested, so adopting it would
make the measurement perfectly circular and perfectly meaningless. The tile is
drawn deliberately wide - kilometres across - so the real feature is visible
even when the transform is badly wrong, and the number that gets written down
is where the FEATURE is, not where the crosshair is.

If a feature is not visible in its tile, that is a finding. Record no point and
say so; do not widen the tile until something plausible appears.
"""

from __future__ import annotations

import argparse
import csv
import pathlib
import subprocess

import cv2
import numpy as np
from osgeo import gdal

from tools.church.geometry import lonlat_to_mercator
from tools.church.panels import get_panel
from tools.church.rasters import block_min_reduce

gdal.UseExceptions()

CROSSHAIR_COLOUR = (0, 0, 255)
LABEL_COLOUR = (0, 120, 0)


def inverse_transform(vrt: pathlib.Path, points: list[tuple[float, float]]) -> list:
    """Push EPSG:3857 metres back to panel-local pixels through the same TPS."""
    stdin = "\n".join(f"{x} {y}" for x, y in points)
    completed = subprocess.run(
        ["gdaltransform", "-tps", "-i", str(vrt)],
        input=stdin, capture_output=True, text=True, check=True,
    )
    got = []
    for line in completed.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            got.append((float(parts[0]), float(parts[1])))
    if len(got) != len(points):
        raise ValueError(f"inverse transform returned {len(got)} of {len(points)} points")
    return got


def read_candidates(path: pathlib.Path) -> list[dict]:
    rows = [
        row
        for row in csv.DictReader(
            line for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        )
    ]
    for row in rows:
        for column in ("label", "lon", "lat"):
            if column not in row:
                raise ValueError(f"candidate file needs a {column!r} column")
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("county")
    parser.add_argument("panel")
    parser.add_argument("--source", required=True)
    parser.add_argument("--vrt", type=pathlib.Path, required=True)
    parser.add_argument("--candidates", type=pathlib.Path, required=True)
    parser.add_argument("--tile", type=int, default=1400, help="tile size in source px")
    parser.add_argument("--scale", type=int, default=2, help="block reduction per tile")
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    panel = get_panel(args.county, args.panel)
    window = panel.window
    sheet = gdal.Open(args.source)
    sheet_width, sheet_height = sheet.RasterXSize, sheet.RasterYSize
    sheet = None
    candidates = read_candidates(args.candidates)

    mercator = [lonlat_to_mercator(float(r["lon"]), float(r["lat"])) for r in candidates]
    local = inverse_transform(args.vrt, mercator)

    side = args.tile // args.scale
    tiles: list[np.ndarray] = []
    predictions: list[tuple[str, float, float]] = []
    for row, (local_x, local_y) in zip(candidates, local):
        sheet_x = local_x + window.x
        sheet_y = local_y + window.y
        predictions.append((row["label"], sheet_x, sheet_y))

        # Clamp to the sheet. A feature near the margin would otherwise ask for
        # a negative offset and come back as a blank tile, which reads as "not
        # drawn" when the truth is "not read".
        origin_x = max(0, min(sheet_width - args.tile, int(sheet_x - args.tile / 2)))
        origin_y = max(0, min(sheet_height - args.tile, int(sheet_y - args.tile / 2)))
        tile = np.full((side, side), 255, np.uint8)
        clamped = origin_x != int(sheet_x - args.tile / 2) or origin_y != int(
            sheet_y - args.tile / 2
        )
        try:
            patch = block_min_reduce(
                args.source, args.scale, (origin_x, origin_y, args.tile, args.tile)
            )
            tile[: patch.shape[0], : patch.shape[1]] = patch
        except Exception as error:  # genuinely outside the raster
            cv2.putText(tile, str(error)[:40], (8, side // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, 0, 1)

        tile = cv2.cvtColor(tile, cv2.COLOR_GRAY2BGR)
        mark_x = int((sheet_x - origin_x) / args.scale)
        mark_y = int((sheet_y - origin_y) / args.scale)
        cv2.line(tile, (mark_x - 26, mark_y), (mark_x - 8, mark_y), CROSSHAIR_COLOUR, 2)
        cv2.line(tile, (mark_x + 8, mark_y), (mark_x + 26, mark_y), CROSSHAIR_COLOUR, 2)
        cv2.line(tile, (mark_x, mark_y - 26), (mark_x, mark_y - 8), CROSSHAIR_COLOUR, 2)
        cv2.line(tile, (mark_x, mark_y + 8), (mark_x, mark_y + 26), CROSSHAIR_COLOUR, 2)
        cv2.circle(tile, (mark_x, mark_y), 60, CROSSHAIR_COLOUR, 1)
        cv2.rectangle(tile, (0, 0), (side - 1, side - 1), (0, 0, 0), 2)
        cv2.putText(tile, row["label"][:34], (8, 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, LABEL_COLOUR, 2)
        cv2.putText(
            tile,
            f"org {origin_x},{origin_y} 1px={args.scale}" + (" CLAMPED" if clamped else ""),
            (8, side - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45, LABEL_COLOUR, 1,
        )
        tiles.append(tile)

    columns = max(1, args.columns)
    rows_of_tiles = []
    for start in range(0, len(tiles), columns):
        chunk = tiles[start : start + columns]
        while len(chunk) < columns:
            chunk.append(np.full_like(tiles[0], 245))
        rows_of_tiles.append(np.hstack(chunk))
    sheet = np.vstack(rows_of_tiles)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.out), sheet)

    index = args.out.with_suffix(".csv")
    with index.open("w", encoding="utf-8") as handle:
        handle.write("label,predicted_sheet_x,predicted_sheet_y,tile_px,scale\n")
        for label, x, y in predictions:
            handle.write(f"{label},{x:.1f},{y:.1f},{args.tile},{args.scale}\n")

    print(f"wrote {args.out} ({sheet.shape[1]}x{sheet.shape[0]}), {len(tiles)} tiles")
    print(f"predictions -> {index}")
    print("Crosshairs are WHERE TO LOOK, not answers. Record the feature.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
