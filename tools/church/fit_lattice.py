"""Report the regular lattice fitted to each detected graticule family.

    python3 -m tools.church.fit_lattice inverness north

An inspection tool. It prints what `tools.church.lattice` decided and why, so a
detection can be judged before its control points are trusted: how many distinct
rules survived deduplication, what pitch they sit on, how tightly they fit it,
and - most importantly - which lattice positions have NO detected rule.

A large fit RMS or a long list of missing indices means the detection picked up
topography, not a graticule, and the mesh should not be emitted.

Pure stdlib: reads the committed detection artifact, not the scan.
"""

from __future__ import annotations

import argparse
import pathlib

from tools.church.detection import load_detection
from tools.church.lattice import LatticeFamily, fit_family
from tools.church.panels import get_panel

DEFAULT_DETECTIONS = pathlib.Path("tools/church/detections")


def describe(label: str, family: LatticeFamily | None) -> list[str]:
    if family is None:
        return [f"{label}: NO consistent lattice - too few lines, or not regularly spaced"]
    lines = [
        f"{label}: {len(family.lines)} distinct rules, "
        f"pitch {family.spacing_px:.1f} px, fit RMS {family.rms_px:.1f} px "
        f"({100.0 * family.rms_px / family.spacing_px:.1f} % of a step)",
        f"    indices  {list(family.indices)}",
        f"    offsets  {[round(placed.offset, 1) for placed in family.lines]}",
    ]
    missing = family.missing_indices
    lines.append(
        f"    missing  {list(missing)}" if missing else "    missing  none"
    )
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("county")
    parser.add_argument("panel")
    parser.add_argument("--detections", type=pathlib.Path, default=DEFAULT_DETECTIONS)
    parser.add_argument("--tolerance", type=float, default=None)
    parser.add_argument(
        "--min-extent",
        type=float,
        nargs="+",
        default=None,
        help="one value for both families, or two: meridians then parallels",
    )
    args = parser.parse_args(argv)

    panel = get_panel(args.county, args.panel)
    settings = panel.graticule
    tolerance = args.tolerance if args.tolerance is not None else (
        settings.tolerance_px if settings else 120.0
    )
    if args.min_extent is not None:
        extents = (
            tuple(args.min_extent)
            if len(args.min_extent) == 2
            else (args.min_extent[0], args.min_extent[0])
        )
    else:
        extents = settings.min_extent_px if settings else (0.0, 0.0)

    detection = load_detection(args.detections / f"{args.county}-{args.panel}.json")
    print(
        f"{args.county}/{args.panel}: {len(detection.family_a)} + "
        f"{len(detection.family_b)} detected lines at angles "
        f"{detection.primary_angle_deg:.1f} / {detection.secondary_angle_deg:.1f}"
    )
    print(
        f"tolerance {tolerance:g} px, minimum extent "
        f"{extents[0]:g} px (A) / {extents[1]:g} px (B)\n"
    )

    fitted = 0
    for label, lines, extent in (
        ("A", detection.family_a, extents[0]),
        ("B", detection.family_b, extents[1]),
    ):
        family = fit_family(list(lines), tolerance, extent)
        fitted += family is not None
        print("\n".join(describe(label, family)))
    return 0 if fitted == 2 else 1


if __name__ == "__main__":
    raise SystemExit(main())
