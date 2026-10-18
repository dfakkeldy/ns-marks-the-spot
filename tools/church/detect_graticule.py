"""Detect the printed lat/lon graticule inside one Church panel.

    python3 -m tools.church.detect_graticule work/inverness-master.tif \
        --county inverness --panel north --out tools/church/detections/inverness-north.json

The graticule is the only family of genuinely long straight lines in the map
interior - roads bend, rivers meander, county boundaries are irregular. Once the
panel's cutline has removed the neat lines, inset boxes, and the engraved
divider, long straight segments separate cleanly from topography.

Two details are load-bearing and were both learned the hard way:

* Thin-structure isolation. The coastal hachure is a dense dark MASS, and a
  Hough transform will happily fit long straight lines through it and report a
  confident false family. A morphological opening keeps the mass, so subtracting
  the opening leaves 1-3 px linework only.
* Pinned angles. Where a printed degree/minute label has been read off the scan,
  its angle is evidence and beats the histogram, which the hachure band can win
  at permissive line lengths.

Writes the artifact that `tools.church.detection` consumes. Everything
downstream of this file is pure stdlib and reproducible without the scan.
"""

from __future__ import annotations

import argparse
import json
import pathlib

import cv2
import numpy as np

from tools.church.linefit import Segment, dominant_angles, merge_collinear, split_families
from tools.church.panels import ChurchPanel, get_panel
from tools.church.rasters import block_min_reduce

MERGE_ANGLE_TOL_DEG = 1.5
MERGE_OFFSET_TOL_PX = 12.0
CUTLINE_EROSION_PX = 9
"""Pull the cutline mask inward so the panel's own bounding rules - which are
long, straight, and far darker than the graticule - can never be detected as
graticule lines."""


def panel_ink(source: str, panel: ChurchPanel, factor: int, darkness: int) -> np.ndarray:
    """Reduced, cutline-masked, thin-structure-only ink mask for one panel."""
    window = panel.window
    reduced = block_min_reduce(
        source, factor, (window.x, window.y, window.width, window.height)
    )
    height, width = reduced.shape

    local = panel.cutline.to_local(window)
    polygon = np.array(
        [[int(x / factor), int(y / factor)] for x, y in local.vertices], np.int32
    )
    keep = np.zeros((height, width), np.uint8)
    cv2.fillPoly(keep, [polygon], 255)
    keep = cv2.erode(keep, np.ones((CUTLINE_EROSION_PX, CUTLINE_EROSION_PX), np.uint8))

    ink = ((reduced < darkness).astype(np.uint8) * 255) & keep

    mass = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    thin = cv2.subtract(ink, mass)
    return cv2.morphologyEx(thin, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))


def hough_segments(ink: np.ndarray, min_length: int) -> list[Segment]:
    found = cv2.HoughLinesP(
        ink, 1, np.pi / 3600.0, threshold=100, minLineLength=min_length, maxLineGap=30
    )
    if found is None:
        return []
    return [tuple(float(value) for value in segment) for segment in found[:, 0, :]]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source")
    parser.add_argument("--county", default="inverness")
    parser.add_argument("--panel", required=True)
    # Defaults come from the panel's registered DetectionSettings, so a
    # published artifact can be regenerated without anyone having to remember
    # which numbers were used. Flags are for exploring a NEW panel.
    parser.add_argument("--factor", type=int, default=None)
    parser.add_argument("--darkness", type=int, default=None)
    parser.add_argument("--min-length", type=int, default=None)
    parser.add_argument(
        "--angle-a",
        type=float,
        default=None,
        help="pin the first family's angle in degrees, from a printed label",
    )
    parser.add_argument("--angle-b", type=float, default=None)
    parser.add_argument("--angle-tol", type=float, default=None)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    panel = get_panel(args.county, args.panel)
    registered = panel.detection
    factor = _choose(args.factor, registered.factor if registered else None, 4)
    darkness = _choose(args.darkness, registered.darkness if registered else None, 140)
    min_length = _choose(
        args.min_length, registered.min_length_px if registered else None, 500
    )
    angle_tolerance = (
        args.angle_tol
        if args.angle_tol is not None
        else registered.angle_tolerance_deg if registered else 6.0
    )

    ink = panel_ink(args.source, panel, factor, darkness)
    segments = hough_segments(ink, min_length)
    if not segments:
        print("no segments found; try a higher --darkness or a shorter --min-length")
        return 1

    primary, secondary = dominant_angles(segments)
    pinned = registered.angles_deg if registered else None
    if pinned is not None:
        primary, secondary = pinned
    if args.angle_a is not None:
        primary = args.angle_a
    if args.angle_b is not None:
        secondary = args.angle_b
    is_pinned = pinned is not None or args.angle_a is not None

    family_a, family_b = split_families(
        segments,
        primary,
        secondary,
        angle_tolerance,
    )
    result = {
        "panel": args.panel,
        "county": args.county,
        "factor": factor,
        "darkness": darkness,
        "min_length_px": min_length,
        "origin": [panel.window.x, panel.window.y],
        "primary_angle_deg": primary,
        "secondary_angle_deg": secondary,
        "angle_tolerance_deg": angle_tolerance,
        "family_a": [
            _as_dict(line)
            for line in merge_collinear(family_a, MERGE_ANGLE_TOL_DEG, MERGE_OFFSET_TOL_PX)
        ],
        "family_b": [
            _as_dict(line)
            for line in merge_collinear(family_b, MERGE_ANGLE_TOL_DEG, MERGE_OFFSET_TOL_PX)
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=1), encoding="utf-8")

    preview = cv2.cvtColor(ink, cv2.COLOR_GRAY2BGR)
    for family, colour in ((result["family_a"], (0, 0, 255)), (result["family_b"], (0, 200, 0))):
        for entry in family:
            if entry["extent_px"] < min_length:
                continue
            reach = 40000.0
            cv2.line(
                preview,
                (int(entry["cx"] - entry["dx"] * reach), int(entry["cy"] - entry["dy"] * reach)),
                (int(entry["cx"] + entry["dx"] * reach), int(entry["cy"] + entry["dy"] * reach)),
                colour,
                2,
            )
    cv2.imwrite(str(args.out.with_suffix(".preview.png")), preview)

    print(
        f"{len(segments)} segments at min length {min_length} -> "
        f"family_a {len(result['family_a'])} lines, "
        f"family_b {len(result['family_b'])} lines "
        f"(angles {primary:.1f} / {secondary:.1f}"
        f"{', pinned' if is_pinned else ', auto-detected'})"
    )
    return 0


def _choose(override: int | None, registered: int | None, fallback: int) -> int:
    if override is not None:
        return override
    return registered if registered is not None else fallback


def _as_dict(line) -> dict:
    return {
        "cx": line.cx,
        "cy": line.cy,
        "dx": line.dx,
        "dy": line.dy,
        "angle_deg": line.angle_deg,
        "extent_px": line.extent_px,
        "support": line.support,
    }


if __name__ == "__main__":
    raise SystemExit(main())
