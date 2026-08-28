"""Georeference and tile every human-reviewed Fletcher sheet, resumably."""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess

from tools.fletcher.batch import BatchItem, run_batch
from tools.fletcher.georeference import (
    build_tile_command,
    georeference,
)
from tools.fletcher.grids import REVIEWED_GRIDS
from tools.fletcher.manifest import Manifest
from tools.fletcher.series import PRIORITY_SHEETS


def _resume_warp(
    source: pathlib.Path,
    gcps: pathlib.Path,
    output: pathlib.Path,
) -> tuple[pathlib.Path, dict]:
    accuracy_path = output / "accuracy.json"
    if accuracy_path.exists():
        metadata = json.loads(accuracy_path.read_text(encoding="utf-8"))
        raster = output / f"{metadata['selected_method']}-3857.tif"
        if raster.exists():
            return raster, metadata
    return georeference(source, gcps, output)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=pathlib.Path, required=True)
    parser.add_argument("--zoom-min", type=int, default=8)
    parser.add_argument("--zoom-max", type=int, default=16)
    args = parser.parse_args(argv)

    root = args.root.resolve()
    manifest = Manifest(root / "manifest.json")
    ordered_numbers = [
        sheet.number
        for sheet in PRIORITY_SHEETS
        if sheet.number in REVIEWED_GRIDS
    ]
    items = [
        BatchItem(str(number), manifest.sheets[str(number)]["rumsey_id"])
        for number in ordered_numbers
    ]

    def process(item: BatchItem) -> dict:
        number = int(item.sheet_id)
        slug = f"sheet-{number:02d}"
        fields = manifest.sheets[item.sheet_id]
        source = pathlib.Path(str(fields["source_path"]))
        gcps = root / "gcps" / f"{slug}.csv"
        output = root / "georef" / slug
        raster, metadata = _resume_warp(source, gcps, output)

        tiles = root / "tiles" / slug
        subprocess.run(
            build_tile_command(
                raster,
                tiles,
                args.zoom_min,
                args.zoom_max,
            ),
            check=True,
        )
        preview = root / "qa" / slug / "warped-preview.png"
        preview.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "gdal_translate",
                "-q",
                "-outsize",
                "1600",
                "0",
                str(raster),
                str(preview),
            ],
            check=True,
        )
        tile_count = sum(1 for _ in tiles.rglob("*.png"))
        return {
            "stage": "tiled",
            "rumsey_id": item.rumsey_id,
            "source_path": str(source),
            "source_sha256": fields["source_sha256"],
            **metadata,
            "raster_path": str(raster),
            "tile_path": str(tiles),
            "tile_png_count": tile_count,
            "qa_contact_sheet": str(
                root / "qa" / slug / "graticule-contact-sheet.png"
            ),
            "qa_warped_preview": str(preview),
            "qa_review": REVIEWED_GRIDS[number].qa_note,
        }

    run_batch(
        items,
        manifest,
        process=process,
        free_bytes=lambda: shutil.disk_usage(root).free,
        enforce_fetch_disk_gate=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
