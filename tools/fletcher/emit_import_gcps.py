"""Emit a feature-led observation as the points CSV the web georeferencer reads.

The browser importer (`web/src/userMaps/parsers/fletcherGcps.ts`) takes the same
`pixel_x,pixel_y,lon,lat,role,label` schema the other emitters write. This turns
a `feature_observations/sheet-NN.json` into that file so measured controls can be
placed in the panel for a human to inspect and drag.

Accepted controls are written as `control`; frozen final checks are written as
`check`. The browser parses both but places only the controls — the checks are
the held-out points the fit is scored against, and promoting one to a control
would make the accuracy figure circular. They are emitted anyway so the file is
a complete record of the observation rather than a lossy view of it.

Rejected candidates are never emitted: each carries a recorded reason for being
unusable, and a file that placed them would invite re-litigating settled calls.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

HEADER = "pixel_x,pixel_y,lon,lat,role,label"

PIXEL_DECIMALS = 1
LONLAT_DECIMALS = 8
"""Matches `emit_physical_gcps.py`. The browser round-trips whatever precision
it is handed, so this only sets what a freshly emitted file looks like."""


def _row(point: dict, role: str) -> str:
    pixel = point["pixel"]
    lonlat = point["lonlat"]
    return (
        f"{float(pixel['x']):.{PIXEL_DECIMALS}f},"
        f"{float(pixel['y']):.{PIXEL_DECIMALS}f},"
        f"{float(lonlat['lon']):.{LONLAT_DECIMALS}f},"
        f"{float(lonlat['lat']):.{LONLAT_DECIMALS}f},"
        f"{role},{point['id']}"
    )


def emit(observation: dict) -> str:
    """Render the observation's controls and frozen checks as one CSV."""
    controls = observation.get("controls", [])
    if not controls:
        raise ValueError("observation has no accepted controls")

    sheet = observation.get("sheet_id", "?")
    method = observation.get("method_version", "?")
    frozen = observation.get("checks_frozen_at")
    lines = [
        f"# sheet-{sheet} Fletcher {method} points.",
        "# GENERATED - edit the observation JSON and re-emit; do not hand-edit.",
        # Stated in the file itself: someone reading only the CSV cannot
        # otherwise tell that the check rows are held out by design.
        "# Controls were fitted; checks are held out and are NOT placed on import.",
    ]
    if frozen:
        lines.append(f"# Final checks frozen {frozen}.")
    lines.append(HEADER)

    for point in controls:
        lines.append(_row(point, "control"))
    for point in observation.get("final_checks", []):
        lines.append(_row(point, "check"))

    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--observation", type=pathlib.Path, required=True)
    parser.add_argument(
        "--out",
        type=pathlib.Path,
        help="Write here instead of stdout.",
    )
    args = parser.parse_args(argv)

    observation = json.loads(args.observation.read_text(encoding="utf-8"))
    csv = emit(observation)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(csv, encoding="utf-8")
    else:
        sys.stdout.write(csv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
