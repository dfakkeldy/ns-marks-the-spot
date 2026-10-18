#!/usr/bin/env python3
"""Prepare the accepted direct-Rumsey Fletcher tiles for object storage.

The package keeps every accepted sheet in its own XYZ namespace. This is
intentional: many sheets contain the same XYZ key, so flattening the trees
would silently replace independently reviewed pixels.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator

EXPECTED_SHEETS = tuple(range(1, 25))
# Fail-closed guard: recalibrate ONLY against a measured tile tree, never to
# make a failing package build pass. 108,701 = the twelve July-cropped sheets
# (51,810) plus the twelve re-cropped to their neat line for revision
# 20260831.1 (56,891). The previous 144,173 described the July compute trees
# and was already stale for 20260828.1, which shipped 148,410 objects because
# sheets 16 and 19 came from the August refit rather than those trees.
EXPECTED_TILE_COUNT = 108_701
MIN_ZOOM = 8
MAX_ZOOM = 16
RUMSEY_ATTRIBUTION = (
    "David Rumsey Map Collection, David Rumsey Map Center, "
    "Stanford University Libraries"
)
RUMSEY_LICENCE_URL = (
    "https://creativecommons.org/licenses/by-nc-sa/3.0/"
)


@dataclass(frozen=True)
class Tile:
    sheet: int
    zoom: int
    x: int
    y: int
    source: Path

    @property
    def key(self) -> str:
        return f"{self.zoom}/{self.x}/{self.y}.png"

    @property
    def object_path(self) -> Path:
        return Path(f"sheet-{self.sheet:02d}") / self.key


@dataclass(frozen=True)
class PackedTile:
    object_path: str
    byte_count: int
    sha256: str
    source_byte_count: int
    transparent: bool


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tile_from_path(root: Path, sheet: int, path: Path) -> Tile:
    relative = path.relative_to(root / "tiles" / f"sheet-{sheet:02d}")
    if len(relative.parts) != 3 or relative.suffix.lower() != ".png":
        raise ValueError(f"unexpected tile path: {path}")
    zoom_text, x_text, filename = relative.parts
    zoom = int(zoom_text)
    x = int(x_text)
    y = int(Path(filename).stem)
    if not MIN_ZOOM <= zoom <= MAX_ZOOM:
        raise ValueError(f"tile zoom outside {MIN_ZOOM}–{MAX_ZOOM}: {path}")
    if not 0 <= x < 2**zoom or not 0 <= y < 2**zoom:
        raise ValueError(f"invalid XYZ coordinate: {path}")
    return Tile(sheet=sheet, zoom=zoom, x=x, y=y, source=path)


def iter_tiles(root: Path) -> Iterator[Tile]:
    for sheet in EXPECTED_SHEETS:
        sheet_root = root / "tiles" / f"sheet-{sheet:02d}"
        if not sheet_root.is_dir():
            raise ValueError(f"missing accepted sheet directory: {sheet_root}")
        for path in sorted(sheet_root.glob("*/*/*.png")):
            yield tile_from_path(root, sheet, path)


def validate_manifest(root: Path, repo_root: Path, tiles: list[Tile]) -> dict:
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("version") != 1:
        raise ValueError("manifest version must be 1")
    sheets = manifest.get("sheets")
    if not isinstance(sheets, dict) or set(sheets) != {
        str(sheet) for sheet in EXPECTED_SHEETS
    }:
        raise ValueError("manifest must contain exactly sheets 1 through 24")

    actual_counts = {sheet: 0 for sheet in EXPECTED_SHEETS}
    for tile in tiles:
        actual_counts[tile.sheet] += 1
    if sum(actual_counts.values()) != EXPECTED_TILE_COUNT:
        raise ValueError(
            f"expected {EXPECTED_TILE_COUNT} accepted tiles, "
            f"found {sum(actual_counts.values())}"
        )

    required_receipt_fields = {"rumsey_id", "source_sha256"}
    for sheet in EXPECTED_SHEETS:
        receipt = sheets[str(sheet)]
        missing = sorted(required_receipt_fields - set(receipt))
        if missing:
            raise ValueError(f"sheet {sheet:02d} missing receipt fields: {missing}")
        if receipt.get("gate") != "PASS":
            raise ValueError(f"sheet {sheet:02d} did not PASS")
        if receipt.get("disposition") not in (None, "PASS"):
            raise ValueError(f"sheet {sheet:02d} disposition is not PASS")
        if receipt.get("stage") != "tiled":
            raise ValueError(f"sheet {sheet:02d} is not tiled")
        if receipt.get("tile_png_count") != actual_counts[sheet]:
            raise ValueError(
                f"sheet {sheet:02d} manifest count "
                f"{receipt.get('tile_png_count')} != {actual_counts[sheet]}"
            )
        expected_directory = root / "tiles" / f"sheet-{sheet:02d}"
        if Path(receipt.get("tile_path", "")) != expected_directory:
            raise ValueError(
                f"sheet {sheet:02d} tile path does not identify accepted directory"
            )
        source_value = receipt.get("source_path")
        source_path = (
            Path(source_value)
            if source_value
            else root / "work" / f"sheet-{sheet:02d}" / f"sheet-{sheet:02d}.tif"
        ).resolve()
        expected_source_root = (root / "work" / f"sheet-{sheet:02d}").resolve()
        if expected_source_root not in source_path.parents:
            raise ValueError(
                f"sheet {sheet:02d} source is not its direct per-sheet input"
            )
        if sha256_file(source_path) != receipt["source_sha256"]:
            raise ValueError(f"sheet {sheet:02d} direct source hash mismatch")

        for path_field, hash_field in (
            ("gcp_path", "gcp_sha256"),
            ("observation_path", "observation_sha256"),
        ):
            path_value = receipt.get(path_field)
            if path_value:
                receipt_path = Path(path_value)
            else:
                directory = "gcps" if path_field == "gcp_path" else "observations"
                receipt_path = (
                    root / directory / f"sheet-{sheet:02d}"
                ).with_suffix(".csv" if path_field == "gcp_path" else ".json")
            if not receipt_path.is_absolute():
                compute_path = root / receipt_path
                receipt_path = (
                    compute_path if compute_path.is_file() else repo_root / receipt_path
                )
            receipt_path = receipt_path.resolve()
            if not receipt_path.is_file():
                raise ValueError(
                    f"sheet {sheet:02d} missing {path_field}: {receipt_path}"
                )
            actual_hash = sha256_file(receipt_path)
            if receipt.get(hash_field) not in (None, actual_hash):
                raise ValueError(f"sheet {sheet:02d} {hash_field} mismatch")
            receipt[f"verified_{hash_field}"] = actual_hash
    return manifest


def duplicate_inventory(tiles: Iterable[Tile]) -> list[dict]:
    members: dict[str, list[str]] = {}
    for tile in tiles:
        members.setdefault(tile.key, []).append(
            f"sheet-{tile.sheet:02d}/{tile.key}"
        )
    return [
        {"key": key, "members": paths}
        for key, paths in sorted(members.items())
        if len(paths) > 1
    ]


def latitude_for_tile_y(y: int, zoom: int) -> float:
    mercator = math.pi * (1 - (2 * y / 2**zoom))
    return math.degrees(math.atan(math.sinh(mercator)))


def sheet_bounds(tiles: Iterable[Tile]) -> dict[int, dict[str, float]]:
    by_sheet: dict[int, list[Tile]] = {}
    for tile in tiles:
        by_sheet.setdefault(tile.sheet, []).append(tile)

    result: dict[int, dict[str, float]] = {}
    for sheet, sheet_tiles in by_sheet.items():
        zoom = max(tile.zoom for tile in sheet_tiles)
        at_zoom = [tile for tile in sheet_tiles if tile.zoom == zoom]
        west_x = min(tile.x for tile in at_zoom)
        east_x = max(tile.x for tile in at_zoom) + 1
        north_y = min(tile.y for tile in at_zoom)
        south_y = max(tile.y for tile in at_zoom) + 1
        result[sheet] = {
            "north": latitude_for_tile_y(north_y, zoom),
            "east": (east_x / 2**zoom) * 360 - 180,
            "south": latitude_for_tile_y(south_y, zoom),
            "west": (west_x / 2**zoom) * 360 - 180,
        }
    return result


def _pack_tile(task: tuple[Tile, Path, str]) -> PackedTile:
    from PIL import Image

    tile, public_root, optimizer = task
    destination = public_root / tile.object_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    source_size = tile.source.stat().st_size

    with Image.open(tile.source) as source_image:
        source_image.load()
        source_rgba = source_image.convert("RGBA")
        source_pixels = source_rgba.tobytes()
        alpha_extrema = source_rgba.getchannel("A").getextrema()
        transparent = alpha_extrema[0] < 255

        if optimizer == "oxipng":
            shutil.copyfile(tile.source, destination)
            subprocess.run(
                [
                    "oxipng",
                    "-o",
                    "2",
                    "--strip",
                    "safe",
                    "--quiet",
                    destination,
                ],
                check=True,
            )
            with Image.open(destination) as packed_image:
                packed_image.load()
                if packed_image.convert("RGBA").tobytes() != source_pixels:
                    destination.unlink(missing_ok=True)
                    raise ValueError(f"pixel mismatch after recompression: {tile.source}")
        elif optimizer == "pillow":
            temporary = destination.with_suffix(".tmp")
            source_image.save(
                temporary,
                format="PNG",
                optimize=True,
                compress_level=9,
            )
            with Image.open(temporary) as packed_image:
                packed_image.load()
                if packed_image.convert("RGBA").tobytes() != source_pixels:
                    temporary.unlink(missing_ok=True)
                    raise ValueError(f"pixel mismatch after recompression: {tile.source}")
            if temporary.stat().st_size < source_size:
                os.replace(temporary, destination)
            else:
                temporary.unlink()
                shutil.copyfile(tile.source, destination)
        elif optimizer == "none":
            shutil.copyfile(tile.source, destination)
        else:
            raise ValueError(f"unsupported optimizer: {optimizer}")

    return PackedTile(
        object_path=tile.object_path.as_posix(),
        byte_count=destination.stat().st_size,
        sha256=sha256_file(destination),
        source_byte_count=source_size,
        transparent=transparent,
    )


def _write_json(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _tree_digest(objects: Iterable[PackedTile]) -> str:
    digest = hashlib.sha256()
    for item in sorted(objects, key=lambda object_: object_.object_path):
        digest.update(
            f"{item.sha256}  {item.object_path}\n".encode("utf-8")
        )
    return digest.hexdigest()


def build_package(args: argparse.Namespace) -> dict:
    root = args.root.resolve()
    repo_root = args.repo_root.resolve()
    output = args.output.resolve()
    if output.exists():
        raise ValueError(f"refusing to overwrite existing package: {output}")

    tiles = list(iter_tiles(root))
    manifest = validate_manifest(root, repo_root, tiles)
    duplicates = duplicate_inventory(tiles)
    bounds = sheet_bounds(tiles)
    if args.sample:
        stride = max(1, len(tiles) // args.sample)
        tiles = tiles[::stride][: args.sample]

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_root = Path(
        tempfile.mkdtemp(prefix=f".{output.name}-", dir=output.parent)
    )
    try:
        public_root = temporary_root / args.revision
        public_root.mkdir(parents=True)
        tasks = (
            (tile, public_root, args.optimizer)
            for tile in tiles
        )
        with ProcessPoolExecutor(max_workers=args.workers) as executor:
            objects = list(executor.map(_pack_tile, tasks, chunksize=32))

        object_bytes = sum(item.byte_count for item in objects)
        source_bytes = sum(item.source_byte_count for item in objects)
        if not args.sample and object_bytes > args.max_bytes:
            raise ValueError(
                f"packed tiles use {object_bytes} bytes, above the "
                f"{args.max_bytes}-byte no-cost gate"
            )

        sheet_receipts = []
        for sheet in EXPECTED_SHEETS:
            receipt = manifest["sheets"][str(sheet)]
            sheet_receipt = {
                "sheet": sheet,
                "rumseyId": receipt["rumsey_id"],
                "sourceSha256": receipt["source_sha256"],
                "gcpSha256": receipt["verified_gcp_sha256"],
                "observationSha256": receipt["verified_observation_sha256"],
                "tileCount": receipt["tile_png_count"],
                "bounds": bounds[sheet],
            }
            if receipt.get("list_number"):
                sheet_receipt["listNumber"] = receipt["list_number"]
            sheet_receipts.append(sheet_receipt)

        public_receipt = {
            "schemaVersion": 1,
            "sourceCommit": args.source_commit,
            "tileRevision": args.revision,
            "imageryTerms": {
                "attribution": RUMSEY_ATTRIBUTION,
                "licence": "CC BY-NC-SA 3.0",
                "licenceUrl": RUMSEY_LICENCE_URL,
                "nonCommercial": True,
                "shareAlike": True,
            },
            "changes": (
                "NS Marks The Spot independently georeferenced, warped, clipped, "
                "and tiled 24 individual direct-Rumsey scans. Software remains "
                "MIT-licensed; map imagery does not."
            ),
            "zoomRange": {"minimum": MIN_ZOOM, "maximum": MAX_ZOOM},
            "sheetCount": len(EXPECTED_SHEETS),
            "tileCount": EXPECTED_TILE_COUNT,
            "delivery": "bounded per-sheet XYZ",
            "overlap": {
                "duplicateKeyCount": len(duplicates),
                "flattened": False,
                "renderOrder": "sheet-01 through sheet-24",
            },
            "tileTreeSha256": _tree_digest(objects),
            "tileBytes": object_bytes,
        }
        _write_json(public_root / "source.json", public_receipt)
        _write_json(
            public_root / "sheets.json",
            {
                "schemaVersion": 1,
                "revision": args.revision,
                "tileTemplate": "sheet-{sheet}/{z}/{x}/{y}.png",
                "sheets": sheet_receipts,
            },
        )

        receipts = temporary_root / "receipts"
        receipts.mkdir()
        with (receipts / "objects.ndjson").open("w", encoding="utf-8") as handle:
            for item in sorted(objects, key=lambda object_: object_.object_path):
                handle.write(
                    json.dumps(
                        {
                            "path": item.object_path,
                            "bytes": item.byte_count,
                            "sha256": item.sha256,
                            "transparent": item.transparent,
                        },
                        sort_keys=True,
                    )
                    + "\n"
                )
        with (receipts / "duplicate-keys.ndjson").open(
            "w", encoding="utf-8"
        ) as handle:
            for duplicate in duplicates:
                handle.write(json.dumps(duplicate, sort_keys=True) + "\n")
        _write_json(
            receipts / "package.json",
            {
                "revision": args.revision,
                "sourceCommit": args.source_commit,
                "sourceBytes": source_bytes,
                "packedBytes": object_bytes,
                "savedBytes": source_bytes - object_bytes,
                "objectCount": len(objects),
                "transparentObjectCount": sum(
                    1 for item in objects if item.transparent
                ),
                "tileTreeSha256": public_receipt["tileTreeSha256"],
                "publicReceiptSha256": sha256_file(public_root / "source.json"),
                "sheetsManifestSha256": sha256_file(public_root / "sheets.json"),
            },
        )
        _write_json(
            temporary_root / "cors.json",
            [
                {
                    "AllowedOrigins": [
                        "https://kinnokilabs.com",
                        "http://localhost:5173",
                    ],
                    "AllowedMethods": ["GET", "HEAD"],
                    "AllowedHeaders": [],
                    "ExposeHeaders": [
                        "Cache-Control",
                        "Content-Length",
                        "Content-Type",
                        "ETag",
                    ],
                    "MaxAgeSeconds": 86400,
                }
            ],
        )
        os.replace(temporary_root, output)
        return json.loads(
            (output / "receipts" / "package.json").read_text(encoding="utf-8")
        )
    except BaseException:
        shutil.rmtree(temporary_root, ignore_errors=True)
        raise


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("root", type=Path, help="Fletcher compute root")
    value.add_argument("output", type=Path, help="new immutable package directory")
    value.add_argument(
        "--repo-root",
        type=Path,
        default=Path.cwd(),
        help="checkout containing the source-receipt files named by manifest.json",
    )
    value.add_argument("--revision", required=True)
    value.add_argument("--source-commit", required=True)
    value.add_argument("--workers", type=int, default=max(1, os.cpu_count() or 1))
    value.add_argument(
        "--max-bytes",
        type=int,
        default=9_900_000_000,
        help="fail rather than prepare a package above this storage budget",
    )
    value.add_argument("--sample", type=int, default=0)
    value.add_argument(
        "--optimizer",
        choices=("none", "pillow", "oxipng"),
        default="pillow",
    )
    return value


def main() -> None:
    args = parser().parse_args()
    result = build_package(args)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
