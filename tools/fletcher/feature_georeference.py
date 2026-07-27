"""Fit a TPS warp for feature-led v2 controls and score it by leave-one-out.

`fit` warps every accepted control with a thin-plate spline and writes
`fit.json`, a provenance receipt naming the control ids/count and the exact
GDAL commands used, alongside the intermediate VRT and the warped raster.
That receipt is later evidence for a result record, the same way
`tools/church/georeference.py` and `tools/fletcher/physical_georeference.py`
record what actually ran rather than just what was intended.

`loo_rows` scores that same control set by leave-one-out: refit without each
point in turn, project its pixel through the resulting TPS warp, and measure
the ground-metre distance to its true position. This is the only honest
per-point accuracy figure available - a TPS warp interpolates its own control
points exactly, so residuals measured *with* a point in its own fit are
always ~0 (see `tools/church/gcps.py`).

GDAL is never invoked directly in tests: every subprocess call goes through
the injectable `Runner`, so CI (which has no GDAL) stays green. `_run` is the
real implementation, used by the CLI below and by the `freeze`/`score` stages
that later tasks add to this module.
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib
import subprocess
from collections.abc import Callable

from tools.church.geometry import mercator_to_ground_metres
from tools.church.georeference import (
    build_translate_command,
    parse_gdaltransform_output,
    warp_command,
)
from tools.fletcher.feature_observation import accepted_controls, load_observation

MINIMUM_CONTROLS = 12
"""Below this, a TPS fit and its leave-one-out diagnostics aren't meaningful."""

FLAG_ABSOLUTE_M = 100.0
FLAG_RELATIVE_MEDIAN = 3.0
"""A LOO row is flagged only when it fails both an absolute and a relative bar -
either alone can trip on a sheet where every point happens to sit near 100 m,
or on one where the whole grid is unusually tight."""

Runner = Callable[[list[str], str | None], str]
"""(command, stdin) -> stdout. Tests supply a fake; `_run` drives real GDAL."""


def _run(command: list[str], stdin: str | None = None) -> str:
    """Execute a GDAL command for real. Never called from tests."""
    completed = subprocess.run(
        command, input=stdin, check=True, capture_output=True, text=True
    )
    return completed.stdout


def fit(
    source: str,
    obs: dict,
    out_dir: pathlib.Path,
    runner: Runner = _run,
) -> pathlib.Path:
    """Warp every accepted control with a thin-plate spline.

    Writes `controls.vrt` (the GCP-bearing crop), `warped-3857.tif` (the TPS
    warp), and `fit.json` (control ids/count and the exact commands). Returns
    the warped raster path. Raises if fewer than `MINIMUM_CONTROLS` controls
    have been accepted.
    """
    controls = accepted_controls(obs)
    if len(controls) < MINIMUM_CONTROLS:
        raise ValueError(
            f"fit requires at least {MINIMUM_CONTROLS} accepted controls, "
            f"got {len(controls)}"
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    vrt = out_dir / "controls.vrt"
    warped = out_dir / "warped-3857.tif"

    translate_command = build_translate_command(source, str(vrt), controls)
    warp_cmd = warp_command(str(vrt), str(warped))
    runner(translate_command, None)
    runner(warp_cmd, None)

    receipt = {
        "source": source,
        "controls_vrt": str(vrt),
        "warped": str(warped),
        "control_count": len(controls),
        "control_ids": sorted(point.label for point in controls),
        "commands": {
            "translate": translate_command,
            "warp": warp_cmd,
        },
    }
    (out_dir / "fit.json").write_text(
        json.dumps(receipt, indent=2) + "\n", encoding="utf-8"
    )
    return warped


def loo_rows(
    source: str,
    obs: dict,
    out_dir: pathlib.Path,
    runner: Runner = _run,
) -> list[dict]:
    """Leave-one-out diagnostics: refit without each control, then measure it.

    Returns one `{"id", "error_m", "flagged"}` row per accepted control,
    sorted by descending error. `flagged` requires error over 100 m *and*
    over 3x the median error, so a single wide-spread sheet does not flag
    every point and a single loose point does not hide among the rest.
    """
    controls = accepted_controls(obs)
    rows = []
    for index, held in enumerate(controls):
        others = controls[:index] + controls[index + 1 :]
        vrt = out_dir / "loo" / f"{held.label}.vrt"
        vrt.parent.mkdir(parents=True, exist_ok=True)
        runner(build_translate_command(source, str(vrt), others), None)
        stdout = runner(["gdaltransform", "-tps", str(vrt)], f"{held.pixel_x} {held.pixel_y}\n")
        got_x, got_y = parse_gdaltransform_output(stdout)[0]
        want_x, want_y = held.mercator
        error = mercator_to_ground_metres(math.hypot(got_x - want_x, got_y - want_y), held.lat)
        rows.append({"id": held.label, "error_m": error})
    errors = sorted(row["error_m"] for row in rows)
    median = errors[len(errors) // 2]
    for row in rows:
        row["flagged"] = row["error_m"] > FLAG_ABSOLUTE_M and row["error_m"] > FLAG_RELATIVE_MEDIAN * median
    return sorted(rows, key=lambda row: -row["error_m"])


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in ("fit", "loo"):
        sub = subparsers.add_parser(name)
        sub.add_argument("--source", required=True)
        sub.add_argument("--observation", type=pathlib.Path, required=True)
        sub.add_argument("--out", type=pathlib.Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    obs = load_observation(args.observation)
    if args.command == "fit":
        warped = fit(args.source, obs, args.out)
        print(warped)
    elif args.command == "loo":
        rows = loo_rows(args.source, obs, args.out)
        print(json.dumps(rows, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
