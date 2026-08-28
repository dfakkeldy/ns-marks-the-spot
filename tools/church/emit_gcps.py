"""Regenerate a panel's control CSV from its committed detection artifact.

    python3 -m tools.church.emit_gcps inverness north \
        --out tools/church/gcps/inverness-north.csv

Pure stdlib on purpose. Detection needs OpenCV and the 180 MB archival scan;
this step needs neither, so the control points can be regenerated and diffed on
any machine, and `--check` can assert in CI that the committed CSV still
matches what the committed detection produces.

Everything this reads is versioned: the detection artifact, the panel's cutline,
and the graticule anchor measured off the scan. Nothing is passed on the command
line that could silently differ between runs - the first emission of the
Inverness north CSV typed its anchor latitude as `46.833333` rather than the
exact 46 degrees 50 minutes, and every coordinate in the file inherited that
rounding.
"""

from __future__ import annotations

import argparse
import pathlib
import sys

from tools.church.detection import build_mesh, load_detection
from tools.church.panels import ChurchPanel, get_panel

DEFAULT_DETECTIONS = pathlib.Path("tools/church/detections")

HEADER_TEMPLATE = """\
# {county} {panel} panel graticule control mesh, full-sheet pixel coordinates.
#
# GENERATED - do not hand-edit. Regenerate with:
#   python3 -m tools.church.emit_gcps {county} {panel} --out {out}
#
# Intersections of the printed graticule, detected by
# tools/church/detect_graticule.py into {detection},
# fitted as a regular lattice and anchored on labels read off the scan:
#   {evidence}
# Step {step:g} arcminutes; meridian index {meridian_index} = {meridian_lon:.6f},
# parallel index {parallel_index} = {parallel_lat:.6f}.
{correction_note}#
# These are CONTROL only. Every check point is an independent physical feature
# in a separate file - a graticule intersection must never be used to measure
# the accuracy of a warp fitted on graticule intersections.
"""


def emit(panel: ChurchPanel, detection_path: pathlib.Path, out_path: pathlib.Path) -> str:
    """Build the CSV text for one panel."""
    if panel.graticule is None:
        raise ValueError(
            f"panel {panel.county_slug}/{panel.slug} has no graticule settings; "
            f"its printed graticule has not been read off the scan yet"
        )

    settings = panel.graticule
    detection = load_detection(detection_path)
    build = build_mesh(
        detection,
        settings.control_anchor,
        tolerance=settings.tolerance_px,
        min_extent=settings.min_extent_px,
    )
    correction_note = ""
    if settings.longitude_correction_arcseconds:
        correction_note = (
            f"# Applied longitude correction "
            f"{settings.longitude_correction_arcseconds:+.3f} arcseconds, "
            f"independently fixed from:\n#   {settings.correction_evidence}\n"
        )

    lines = [
        HEADER_TEMPLATE.format(
            county=panel.county_slug,
            panel=panel.slug,
            out=out_path.as_posix(),
            detection=detection_path.as_posix(),
            evidence=settings.anchor_evidence,
            step=settings.anchor.step_minutes,
            meridian_index=settings.anchor.meridian_index,
            meridian_lon=settings.anchor.meridian_lon,
            parallel_index=settings.anchor.parallel_index,
            parallel_lat=settings.anchor.parallel_lat,
            correction_note=correction_note,
        ).rstrip("\n"),
        "pixel_x,pixel_y,lon,lat,role,label",
    ]
    for point in build.mesh.control_points():
        lines.append(
            f"{point.pixel_x:.1f},{point.pixel_y:.1f},"
            f"{point.lon:.6f},{point.lat:.6f},{point.role},{point.label}"
        )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("county")
    parser.add_argument("panel")
    parser.add_argument("--detections", type=pathlib.Path, default=DEFAULT_DETECTIONS)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail instead of writing if the file on disk differs",
    )
    args = parser.parse_args(argv)

    panel = get_panel(args.county, args.panel)
    detection_path = args.detections / f"{args.county}-{args.panel}.json"
    text = emit(panel, detection_path, args.out)

    if args.check:
        if not args.out.exists():
            print(f"{args.out} does not exist", file=sys.stderr)
            return 1
        if args.out.read_text(encoding="utf-8") != text:
            print(
                f"{args.out} is stale; regenerate it with "
                f"`python3 -m tools.church.emit_gcps {args.county} {args.panel} "
                f"--out {args.out.as_posix()}`",
                file=sys.stderr,
            )
            return 1
        print(f"{args.out} matches its detection artifact")
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    written = sum(
        1
        for line in text.splitlines()
        if line and not line.startswith("#") and not line.startswith("pixel_x")
    )
    print(f"{written} control points -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
