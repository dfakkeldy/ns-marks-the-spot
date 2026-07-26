"""Emit separate, deterministic GCP CSVs from a Sheet 24 physical observation."""

from __future__ import annotations

import argparse
import os
import pathlib
import sys
from dataclasses import dataclass

from tools.fletcher.physical_observation import (
    METHOD_VERSION,
    SHEET_ID,
    AcceptedPoint,
    PhysicalObservation,
    load_observation,
)


HEADER = "pixel_x,pixel_y,lon,lat,role,label"


@dataclass(frozen=True)
class EmittedPhysicalGCPs:
    """The separately rendered controls and held-out final checks."""

    controls: str
    checks: str


def render(points: tuple[AcceptedPoint, ...], role: str, sheet: str) -> str:
    """Render a role-pure CSV with stable ordering and precision."""
    lines = [
        f"# {sheet} Fletcher {role} physical-feature points.",
        "# GENERATED - edit the observation JSON and re-emit; do not hand-edit.",
        HEADER,
    ]
    for point in sorted(points, key=lambda item: item.id):
        pixel_x, pixel_y = point.pixel
        lon, lat = point.modern_coordinate
        lines.append(
            f"{pixel_x:.1f},{pixel_y:.1f},{lon:.8f},{lat:.8f},{role},{point.id}"
        )
    return "\n".join(lines) + "\n"


def emit(observation: PhysicalObservation) -> EmittedPhysicalGCPs:
    """Render one physical observation without writing to disk."""
    if observation.sheet_id != SHEET_ID or observation.method_version != METHOD_VERSION:
        raise ValueError("physical GCP emission is restricted to Sheet 24 modern-feature-v1")
    if observation.status == "rejected":
        raise ValueError("cannot emit a rejected observation")
    if observation.status != "frozen":
        raise ValueError("physical GCP emission requires a frozen observation")
    return EmittedPhysicalGCPs(
        controls=render(observation.controls, "control", observation.sheet_id),
        checks=render(observation.final_checks, "check", observation.sheet_id),
    )


def check_outputs(
    observation: PhysicalObservation,
    controls: str,
    checks: str,
) -> None:
    """Refuse supplied output text that is not byte-identical to the observation."""
    expected = emit(observation)
    stale_roles = [
        role
        for role, actual, rendered in (
            ("controls", controls, expected.controls),
            ("checks", checks, expected.checks),
        )
        if actual != rendered
    ]
    if stale_roles:
        raise ValueError(
            "; ".join(f"{role} output is stale" for role in stale_roles)
        )


def write_outputs(
    emitted: EmittedPhysicalGCPs,
    controls_path: pathlib.Path,
    checks_path: pathlib.Path,
) -> None:
    """Write both output files through sibling temporary files."""
    if controls_path.resolve() == checks_path.resolve():
        raise ValueError("controls and checks must be separate output files")
    for path in (controls_path, checks_path):
        path.parent.mkdir(parents=True, exist_ok=True)

    controls_temporary = controls_path.with_name(f"{controls_path.name}.tmp")
    checks_temporary = checks_path.with_name(f"{checks_path.name}.tmp")
    controls_temporary.write_text(emitted.controls, encoding="utf-8")
    checks_temporary.write_text(emitted.checks, encoding="utf-8")
    os.replace(controls_temporary, controls_path)
    os.replace(checks_temporary, checks_path)


def _stale_output_paths(
    emitted: EmittedPhysicalGCPs,
    controls_path: pathlib.Path,
    checks_path: pathlib.Path,
) -> list[pathlib.Path]:
    stale: list[pathlib.Path] = []
    for path, expected in (
        (controls_path, emitted.controls),
        (checks_path, emitted.checks),
    ):
        try:
            actual = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            actual = None
        if actual != expected:
            stale.append(path)
    return stale


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("observation", type=pathlib.Path)
    parser.add_argument("--controls", type=pathlib.Path, required=True)
    parser.add_argument("--checks", type=pathlib.Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)

    if args.controls.resolve() == args.checks.resolve():
        parser.error("--controls and --checks must be separate files")
    observation = load_observation(args.observation)
    emitted = emit(observation)
    if args.check:
        stale_paths = _stale_output_paths(emitted, args.controls, args.checks)
        if stale_paths:
            for path in stale_paths:
                print(
                    f"{path} is stale; re-emit it from {args.observation}",
                    file=sys.stderr,
                )
            return 1
        print(f"{args.controls} and {args.checks} match {args.observation}")
        return 0

    write_outputs(emitted, args.controls, args.checks)
    print(args.controls)
    print(args.checks)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
