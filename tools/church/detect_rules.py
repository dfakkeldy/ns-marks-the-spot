"""Detect the heavy ruled borders that delimit panels and insets on a Church sheet.

    python3 -m tools.church.detect_rules work/inverness-master.tif --out work/rules.json

The panel dividers, neat lines, and inset boxes are drawn as thick black rules -
by far the darkest, straightest, longest marks on the sheet. Detecting them
beats eyeballing downsampled previews, which is how the 2026-07-24 pilot came to
believe the Inverness divider was a single straight edge. It is a polyline that
bends at (11773, 23928), and the pilot's rectangles were several thousand pixels
wrong because of it. See docs/church-inverness-cutlines-2026-07-24.md.

Emits segments in FULL-SHEET pixel coordinates plus a preview image. Needs GDAL
and OpenCV; the geometry it feeds lives in `tools.church.linefit`.
"""

from __future__ import annotations

import argparse
import json
import pathlib

import cv2
import numpy as np

from tools.church.linefit import Segment, segment_angle_deg
from tools.church.rasters import block_min_reduce


def hough_segments(
    ink: np.ndarray, darkness: int, min_length: int
) -> list[Segment]:
    """Threshold to ink and pull out long straight runs."""
    mask = (ink < darkness).astype(np.uint8) * 255
    # Bridge fold damage and places where a label crosses the rule.
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    found = cv2.HoughLinesP(
        mask,
        rho=1,
        theta=np.pi / 1800.0,
        threshold=120,
        minLineLength=min_length,
        maxLineGap=12,
    )
    if found is None:
        return []
    return [tuple(float(value) for value in segment) for segment in found[:, 0, :]]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source")
    parser.add_argument("--factor", type=int, default=4)
    parser.add_argument("--darkness", type=int, default=110)
    parser.add_argument("--min-length", type=int, default=250)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    reduced = block_min_reduce(args.source, args.factor)
    segments = hough_segments(reduced, args.darkness, args.min_length)

    described = sorted(
        (
            {
                "x0": segment[0] * args.factor,
                "y0": segment[1] * args.factor,
                "x1": segment[2] * args.factor,
                "y1": segment[3] * args.factor,
                "length_px": float(
                    np.hypot(segment[2] - segment[0], segment[3] - segment[1])
                )
                * args.factor,
                "angle_deg": segment_angle_deg(segment),
            }
            for segment in segments
        ),
        key=lambda entry: -entry["length_px"],
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(described, indent=1), encoding="utf-8")

    preview = cv2.cvtColor(reduced, cv2.COLOR_GRAY2BGR)
    for entry in described[:400]:
        cv2.line(
            preview,
            (int(entry["x0"] / args.factor), int(entry["y0"] / args.factor)),
            (int(entry["x1"] / args.factor), int(entry["y1"] / args.factor)),
            (0, 0, 255),
            2,
        )
    cv2.imwrite(str(args.out.with_suffix(".preview.png")), preview)

    if described:
        print(f"{len(described)} segments; longest {described[0]['length_px']:.0f} px")
    else:
        print("no segments found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
