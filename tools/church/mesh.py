"""Print the control mesh a panel's two graticule families cross into.

    python3 -m tools.church.mesh inverness north

A grid view of the intersections, laid out the way they sit on the sheet, with
the real coordinate each one carries. Reading it across and down is the quickest
way to catch a mis-anchored mesh: the pixel columns must increase monotonically
in the same direction the longitudes do, and if they do not, the anchor's
meridian index or its sign is wrong.

Pure stdlib: reads the committed detection artifact, not the scan.
"""

from __future__ import annotations

import argparse
import pathlib

from tools.church.detection import build_mesh, load_detection
from tools.church.graticule import LatticeIndex
from tools.church.panels import get_panel

DEFAULT_DETECTIONS = pathlib.Path("tools/church/detections")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("county")
    parser.add_argument("panel")
    parser.add_argument("--detections", type=pathlib.Path, default=DEFAULT_DETECTIONS)
    args = parser.parse_args(argv)

    panel = get_panel(args.county, args.panel)
    if panel.graticule is None:
        parser.error(
            f"panel {args.county}/{args.panel} has no graticule anchor registered; "
            f"read a printed degree/minute label off the scan first"
        )

    settings = panel.graticule
    detection = load_detection(args.detections / f"{args.county}-{args.panel}.json")
    build = build_mesh(
        detection,
        settings.anchor,
        tolerance=settings.tolerance_px,
        min_extent=settings.min_extent_px,
    )

    meridians = sorted({index.meridian for index in build.mesh.intersections})
    parallels = sorted({index.parallel for index in build.mesh.intersections})
    print(
        f"{args.county}/{args.panel}: {len(meridians)} x {len(parallels)} = "
        f"{len(build.mesh.intersections)} intersections, "
        f"step {settings.anchor.step_minutes:g} arcminutes"
    )
    print(f"anchor evidence: {settings.anchor_evidence}\n")

    print("     lon" + "".join(f"   parallel {p:<10d}" for p in parallels))
    for meridian in meridians:
        cells = ""
        for parallel in parallels:
            position = build.mesh.intersections.get(LatticeIndex(meridian, parallel))
            cells += (
                f"  ({position[0]:7.0f},{position[1]:7.0f})"
                if position
                else "            --         "
            )
        lon, _ = settings.anchor.coordinate(LatticeIndex(meridian, parallels[0]))
        print(f"{lon:8.4f}{cells}")

    print()
    for parallel in parallels:
        _, lat = settings.anchor.coordinate(LatticeIndex(meridians[0], parallel))
        print(f"  parallel {parallel} = {lat:.6f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
