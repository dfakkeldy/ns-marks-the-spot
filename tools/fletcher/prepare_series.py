"""Emit reviewed observations/GCPs and checkpoint rejected Fletcher sheets."""

from __future__ import annotations

import argparse
import datetime
import json
import pathlib

from tools.fletcher.emit_gcps import emit
from tools.fletcher.grids import (
    REJECTED_GRIDS,
    REVIEWED_GRIDS,
    ReviewedGrid,
    check_intersections,
)
from tools.fletcher.manifest import Manifest


def select_dispositions(
    sheet_numbers: list[int] | None,
) -> tuple[list[tuple[int, ReviewedGrid]], list[tuple[int, str]]]:
    ordered = list(range(1, 25)) if sheet_numbers is None else sheet_numbers
    reviewed: list[tuple[int, ReviewedGrid]] = []
    rejected: list[tuple[int, str]] = []
    for number in ordered:
        if number in REVIEWED_GRIDS:
            reviewed.append((number, REVIEWED_GRIDS[number]))
        elif number in REJECTED_GRIDS:
            rejected.append((number, REJECTED_GRIDS[number]))
        else:
            raise ValueError(f"sheet {number} has no review disposition")
    return reviewed, rejected


def build_observation(
    number: int,
    grid: ReviewedGrid,
    *,
    rumsey_id: str,
    source_sha256: str,
) -> dict:
    if grid.intersections:
        method = (
            "The full-resolution scan's engraved coordinate labels were read "
            "directly. Each retained graticule crossing was then measured "
            "individually because the scan is slanted and the automatic "
            "regular-lattice detector was inadequate. Folds, hatching, "
            "boundaries, text strokes and neatlines were excluded before "
            "roles were assigned."
        )
    else:
        method = (
            "Long regular rules were detected from the full-resolution scan; "
            "every retained intersection and its engraved coordinate labels "
            "were then visually reviewed. Folds, hatching and neatlines were "
            "excluded before roles were assigned."
        )
    observation = {
        "sheet": f"sheet-{number:02d}",
        "rumsey_id": rumsey_id,
        "source_sha256": source_sha256,
        "retrieved": datetime.date.today().isoformat(),
        "method": method,
        "qa_review": grid.qa_note,
        "meridians": [
            (
                {"lon": line.coordinate, "label": line.label}
                if line.pixel is None
                else {
                    "pixel_x": line.pixel,
                    "lon": line.coordinate,
                    "label": line.label,
                }
            )
            for line in grid.meridians
        ],
        "parallels": [
            (
                {"lat": line.coordinate, "label": line.label}
                if line.pixel is None
                else {
                    "pixel_y": line.pixel,
                    "lat": line.coordinate,
                    "label": line.label,
                }
            )
            for line in grid.parallels
        ],
        "check_intersections": (
            [list(pair) for pair in grid.checks]
            if grid.checks
            else check_intersections(
                len(grid.meridians),
                len(grid.parallels),
            )
        ),
    }
    if grid.intersections:
        observation["intersections"] = [
            {
                "meridian_index": point.meridian_index,
                "parallel_index": point.parallel_index,
                "pixel_x": point.pixel_x,
                "pixel_y": point.pixel_y,
            }
            for point in grid.intersections
        ]
    return observation


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=pathlib.Path, required=True)
    parser.add_argument("--sheet", type=int, action="append")
    args = parser.parse_args(argv)

    root = args.root.resolve()
    manifest = Manifest(root / "manifest.json")
    observations = root / "observations"
    gcps = root / "gcps"
    observations.mkdir(parents=True, exist_ok=True)
    gcps.mkdir(parents=True, exist_ok=True)

    reviewed, rejected = select_dispositions(args.sheet)
    for number, grid in reviewed:
        sheet_id = str(number)
        fields = manifest.sheets[sheet_id]
        observation = build_observation(
            number,
            grid,
            rumsey_id=str(fields["rumsey_id"]),
            source_sha256=str(fields["source_sha256"]),
        )
        observation_path = observations / f"sheet-{number:02d}.json"
        observation_path.write_text(
            json.dumps(observation, indent=2) + "\n",
            encoding="utf-8",
        )
        gcp_path = gcps / f"sheet-{number:02d}.csv"
        gcp_path.write_text(
            emit(json.dumps(observation)),
            encoding="utf-8",
        )
        if fields.get("stage") != "tiled":
            manifest.update(
                sheet_id,
                stage="observed",
                observation_path=str(observation_path),
                gcp_path=str(gcp_path),
                qa_review=grid.qa_note,
            )
        print(observation_path)
        print(gcp_path)

    for number, reason in rejected:
        if manifest.sheets.get(str(number), {}).get("stage") != "tiled":
            manifest.update(
                str(number),
                stage="failed",
                reason=reason,
                gate="FAIL",
            )
        print(f"sheet-{number:02d}: FAIL: {reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
