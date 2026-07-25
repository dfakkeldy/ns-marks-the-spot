"""Download every Fletcher single sheet with resumable manifest checkpoints."""

from __future__ import annotations

import argparse
import pathlib
import shutil

from tools.fletcher.batch import BatchItem, run_batch
from tools.fletcher.fetch import download_item
from tools.fletcher.manifest import Manifest
from tools.fletcher.series import PRIORITY_SHEETS


def sheet_destination(root: pathlib.Path, slug: str) -> pathlib.Path:
    """Keep region parts scoped to the Rumsey item they came from."""
    return root / "work" / slug


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    root = args.root.resolve()
    manifest = Manifest(root / "manifest.json")
    items = [
        BatchItem(str(sheet.number), sheet.rumsey_id)
        for sheet in PRIORITY_SHEETS
    ]

    def process(item: BatchItem) -> dict:
        slug = f"sheet-{int(item.sheet_id):02d}"
        source, checksum = download_item(
            item.rumsey_id,
            slug,
            sheet_destination(root, slug),
        )
        return {
            "stage": "fetched",
            "rumsey_id": item.rumsey_id,
            "source_path": str(source),
            "source_sha256": checksum,
        }

    run_batch(
        items,
        manifest,
        process=process,
        free_bytes=lambda: shutil.disk_usage(root).free,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
