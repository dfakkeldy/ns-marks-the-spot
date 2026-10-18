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

`freeze` and `score` are the honesty core of the workflow. A sheet's final
checks are frozen exactly once (`freeze`, raising if a stamp already exists)
and scored exactly once against a controls-only fit (`score`, raising if the
output already exists). Neither function lets a later run quietly redo either
step, so the accuracy figure that ends up in a result record cannot have been
produced by an operator who kept re-picking checks or re-fitting until the
number looked good.

GDAL is never invoked directly in tests: every subprocess call goes through
the injectable `Runner`, so CI (which has no GDAL) stays green. `_run` is the
real implementation, used by the CLI below.
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
    check_errors,
    parse_gdaltransform_output,
    warp_command,
)
from tools.fletcher.feature_observation import (
    ACCEPTED,
    accepted_controls,
    frozen_checks,
    load_observation,
)

MINIMUM_CONTROLS = 12
"""Below this, a TPS fit and its leave-one-out diagnostics aren't meaningful."""

MINIMUM_FINAL_CHECKS = 8
"""Below this, held-out coverage of the sheet is too thin to freeze and score."""

MINIMUM_CHECK_REGIONS = 3
"""Final checks must span at least this many QA regions, so one good (or bad)
corner of the sheet cannot pass as sheet-wide accuracy."""

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


def _ensure_dstalpha(command: list[str]) -> list[str]:
    """Insert `-dstalpha` immediately before the source path, unless present.

    `warp_command` only adds `-dstalpha` itself when `target_bounds` is set;
    every production warp in this repo needs it regardless, since a rotated
    sheet's empty corners must come out transparent, not tile as opaque
    black. The last two entries of a `warp_command` result are always
    `[source, output]`, so the flag is spliced in immediately before them.
    """
    if "-dstalpha" in command:
        return command
    return command[:-2] + ["-dstalpha"] + command[-2:]


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
    warp_cmd = _ensure_dstalpha(warp_command(str(vrt), str(warped)))
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

    Raises if fewer than `MINIMUM_CONTROLS` controls have been accepted -
    below that, both the folds themselves and the median used to flag them
    stop being meaningful (and the median lookup below would divide an empty
    list).
    """
    controls = accepted_controls(obs)
    if len(controls) < MINIMUM_CONTROLS:
        raise ValueError(
            f"leave-one-out scoring requires at least {MINIMUM_CONTROLS} "
            f"accepted controls, got {len(controls)}"
        )
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


def freeze(obs_path: pathlib.Path, frozen_at: str) -> dict:
    """Freeze an observation's final checks, once and irreversibly.

    Requires every `final_checks` entry to already be `accepted`, at least
    `MINIMUM_FINAL_CHECKS` of them, spanning at least `MINIMUM_CHECK_REGIONS`
    distinct regions, and ids disjoint from `controls`/`diagnostics`. That
    last condition is already guaranteed by
    `feature_observation.validate_observation` (which `load_observation`
    below runs and which rejects any duplicate id across all three lists);
    it is re-asserted here anyway so this guard does not silently depend on
    that invariant continuing to hold elsewhere.

    Raises if `checks_frozen_at` is already set - a check set is frozen
    exactly once, and this is the only function that writes that stamp.

    On success, writes `checks_frozen_at = frozen_at` back to `obs_path`
    (whole file, one write) and returns the updated observation dict.
    """
    obs = load_observation(obs_path)

    stamp = obs.get("checks_frozen_at")
    if isinstance(stamp, str) and stamp:
        raise ValueError(f"final checks already frozen at {stamp!r}")

    final_checks = obs.get("final_checks", [])
    not_accepted = [point["id"] for point in final_checks if point["review"]["status"] != ACCEPTED]
    if not_accepted:
        raise ValueError(f"final checks not yet accepted: {', '.join(not_accepted)}")

    if len(final_checks) < MINIMUM_FINAL_CHECKS:
        raise ValueError(
            f"freeze requires at least {MINIMUM_FINAL_CHECKS} final checks, "
            f"got {len(final_checks)}"
        )

    regions = {point["region"] for point in final_checks}
    if len(regions) < MINIMUM_CHECK_REGIONS:
        raise ValueError(
            f"freeze requires at least {MINIMUM_CHECK_REGIONS} distinct regions "
            f"among final checks, got {len(regions)}"
        )

    check_ids = {point["id"] for point in final_checks}
    other_ids = {point["id"] for point in obs.get("controls", [])} | {
        point["id"] for point in obs.get("diagnostics", [])
    }
    overlap = check_ids & other_ids
    if overlap:
        raise ValueError(f"final check ids overlap controls/diagnostics: {sorted(overlap)}")

    obs["checks_frozen_at"] = frozen_at
    obs_path.write_text(json.dumps(obs, indent=2) + "\n", encoding="utf-8")
    return obs


def _metrics(errors: list[float]) -> dict:
    ordered = sorted(errors)
    p95_index = max(0, math.ceil(0.95 * len(ordered)) - 1)
    return {
        "count": len(ordered),
        "rms_m": math.sqrt(sum(error * error for error in ordered) / len(ordered)),
        "p95_m": ordered[p95_index],
        "max_m": ordered[-1],
    }


def score(
    source: str,
    obs: dict,
    out_path: pathlib.Path,
    scored_at: str,
    runner: Runner = _run,
) -> dict:
    """Score frozen final checks against a controls-only TPS fit, once.

    Refuses if `out_path` already exists (`already scored`) - a scored
    result is never silently overwritten by a later run against a changed
    fit. Requires the observation's final checks to be frozen
    (`feature_observation.frozen_checks` raises otherwise) and at least
    `MINIMUM_CONTROLS` accepted controls.

    The controls-only fit is built exactly once, and every held-out check
    pixel is projected through it in a single `gdaltransform` call - the
    checks never touch the fit that is being scored against them.

    Returns and writes
    `{"scored_at", "control_count", "overall", "regions", "per_check"}`,
    where `"overall"` and each `"regions"` entry are `_metrics(...)` shaped
    (`count`/`rms_m`/`p95_m`/`max_m`) and `"per_check"` maps each final
    check's id to its ground-metre error.
    """
    if out_path.exists():
        raise ValueError(f"already scored: {out_path}")

    checks = frozen_checks(obs)
    controls = accepted_controls(obs)
    if len(controls) < MINIMUM_CONTROLS:
        raise ValueError(
            f"score requires at least {MINIMUM_CONTROLS} accepted controls, "
            f"got {len(controls)}"
        )

    region_by_id = {point["id"]: point["region"] for point in obs.get("final_checks", [])}

    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Named distinctly from `fit`'s own `controls.vrt` so a `score` call
    # pointed at the same directory as a `fit` call cannot silently overwrite
    # that fit's provenance VRT.
    vrt = out_path.parent / "score-controls.vrt"
    runner(build_translate_command(source, str(vrt), controls), None)

    stdin = "\n".join(f"{point.pixel_x} {point.pixel_y}" for point in checks) + "\n"
    stdout = runner(["gdaltransform", "-tps", str(vrt)], stdin)
    transformed = parse_gdaltransform_output(stdout)
    errors = check_errors(checks, transformed)

    per_region: dict[str, list[float]] = {}
    for point, error in zip(checks, errors):
        per_region.setdefault(region_by_id[point.label], []).append(error)

    result = {
        "scored_at": scored_at,
        "control_count": len(controls),
        "overall": _metrics(errors),
        "regions": {label: _metrics(values) for label, values in sorted(per_region.items())},
        "per_check": {point.label: error for point, error in zip(checks, errors)},
    }
    out_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in ("fit", "loo"):
        sub = subparsers.add_parser(name)
        sub.add_argument("--source", required=True)
        sub.add_argument("--observation", type=pathlib.Path, required=True)
        sub.add_argument("--out", type=pathlib.Path, required=True)
    freeze_sub = subparsers.add_parser("freeze")
    freeze_sub.add_argument("--observation", type=pathlib.Path, required=True)
    freeze_sub.add_argument("--frozen-at", required=True)
    score_sub = subparsers.add_parser("score")
    score_sub.add_argument("--source", required=True)
    score_sub.add_argument("--observation", type=pathlib.Path, required=True)
    score_sub.add_argument("--out", type=pathlib.Path, required=True)
    score_sub.add_argument("--scored-at", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == "freeze":
        updated = freeze(args.observation, args.frozen_at)
        print(json.dumps(updated, indent=2))
        return 0
    obs = load_observation(args.observation)
    if args.command == "fit":
        warped = fit(args.source, obs, args.out)
        print(warped)
    elif args.command == "loo":
        rows = loo_rows(args.source, obs, args.out)
        print(json.dumps(rows, indent=2))
    elif args.command == "score":
        result = score(args.source, obs, args.out, args.scored_at)
        print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
