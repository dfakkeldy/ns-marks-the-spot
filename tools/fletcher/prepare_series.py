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


def build_observation(
    number: int,
    grid: ReviewedGrid,
    *,
    rumsey_id: str,
    source_sha256: str,
) -> dict:
    return {
        "sheet": f"sheet-{number:02d}",
        "rumsey_id": rumsey_id,
        "source_sha256": source_sha256,
        "retrieved": datetime.date.today().isoformat(),
        "method": (
            "Long regular rules were detected from the full-resolution scan; "
            "every retained intersection and its engraved coordinate labels "
            "were then visually reviewed. Folds, hatching and neatlines were "
            "excluded before roles were assigned."
        ),
        "qa_review": grid.qa_note,
        "meridians": [
            {
                "pixel_x": line.pixel,
                "lon": line.coordinate,
                "label": line.label,
            }
            for line in grid.meridians
        ],
        "parallels": [
            {
                "pixel_y": line.pixel,
                "lat": line.coordinate,
                "label": line.label,
            }
            for line in grid.parallels
        ],
        "check_intersections": check_intersections(
            len(grid.meridians),
            len(grid.parallels),
        ),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    root = args.root.resolve()
    manifest = Manifest(root / "manifest.json")
    observations = root / "observations"
    gcps = root / "gcps"
    observations.mkdir(parents=True, exist_ok=True)
    gcps.mkdir(parents=True, exist_ok=True)

    for number, grid in REVIEWED_GRIDS.items():
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

    for number, reason in REJECTED_GRIDS.items():
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
