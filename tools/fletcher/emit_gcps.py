"""Emit a mixed control/check CSV from an observed Fletcher graticule."""

from __future__ import annotations

import argparse
import json
import pathlib
import sys


def emit(observation_text: str) -> str:
    observation = json.loads(observation_text)
    meridians = observation["meridians"]
    parallels = observation["parallels"]
    checks = {tuple(pair) for pair in observation["check_intersections"]}
    measured = observation.get("intersections")
    for meridian_index, parallel_index in checks:
        if not (
            0 <= meridian_index < len(meridians)
            and 0 <= parallel_index < len(parallels)
        ):
            raise ValueError(
                f"check intersection {(meridian_index, parallel_index)} "
                "is outside the observed lattice"
            )

    lines = [
        f"# {observation['sheet']} Fletcher graticule points.",
        "# GENERATED - edit the observation JSON and re-emit; do not hand-edit.",
        "# Control and check intersections are disjoint by construction.",
        "pixel_x,pixel_y,lon,lat,role,label",
    ]
    if measured is None:
        intersections = [
            {
                "meridian_index": meridian_index,
                "parallel_index": parallel_index,
                "pixel_x": meridian["pixel_x"],
                "pixel_y": parallel["pixel_y"],
            }
            for meridian_index, meridian in enumerate(meridians)
            for parallel_index, parallel in enumerate(parallels)
        ]
    else:
        intersections = measured
        measured_indexes: set[tuple[int, int]] = set()
        for intersection in intersections:
            index = (
                int(intersection["meridian_index"]),
                int(intersection["parallel_index"]),
            )
            if index in measured_indexes:
                raise ValueError(
                    f"duplicate measured intersection {index}"
                )
            measured_indexes.add(index)
        missing_checks = checks - measured_indexes
        if missing_checks:
            raise ValueError(
                f"check intersections lack measured pixels: "
                f"{sorted(missing_checks)}"
            )
    for intersection in intersections:
        meridian_index = int(intersection["meridian_index"])
        parallel_index = int(intersection["parallel_index"])
        meridian = meridians[meridian_index]
        parallel = parallels[parallel_index]
        role = (
            "check"
            if (meridian_index, parallel_index) in checks
            else "control"
        )
        label = f"{meridian['label']} {parallel['label']}"
        lines.append(
            f"{float(intersection['pixel_x']):.1f},"
            f"{float(intersection['pixel_y']):.1f},"
            f"{float(meridian['lon']):.6f},"
            f"{float(parallel['lat']):.6f},"
            f"{role},{label}"
        )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("observation", type=pathlib.Path)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    rendered = emit(args.observation.read_text(encoding="utf-8"))
    if args.check:
        if not args.out.exists() or args.out.read_text(encoding="utf-8") != rendered:
            print(f"{args.out} is stale; re-emit it from {args.observation}", file=sys.stderr)
            return 1
        print(f"{args.out} matches {args.observation}")
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendered, encoding="utf-8")
    print(f"{args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
