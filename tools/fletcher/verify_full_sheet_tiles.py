"""Verify full-sheet XYZ coverage and pixel agreement using bounded memory.

Requires GDAL Python and NumPy. Transparent geographic gaps in the source are
preserved; this verifies tiling, not the accuracy of the source georeferencing.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from osgeo import gdal

gdal.UseExceptions()


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tiles", type=Path, required=True)
    p.add_argument("--source", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    meta = json.loads((a.tiles / "source.json").read_text())
    assert digest(a.source) == meta["sourceRasterSha256"]
    inventory_path = a.tiles / "tile-inventory.json"
    assert digest(inventory_path) == meta["inventorySha256"]
    inventory = json.loads(inventory_path.read_text())
    for item in inventory:
        assert digest(a.tiles / item["path"]) == item["sha256"]
    west, south, east, north = meta["bounds"]
    for z in range(meta["minzoom"], meta["maxzoom"] + 1):

        def xy(lon, lat, z=z):
            return (
                (lon + 180) / 360 * 2**z,
                (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2**z,
            )

        x0, y0 = map(math.floor, xy(west, north))
        x1, y1 = map(math.floor, xy(east, south))
        expected = {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
        actual = {
            (int(f.parent.name), int(f.stem))
            for f in (a.tiles / str(z)).glob("*/*.png")
        }
        assert actual == expected, (z, len(expected - actual), len(actual - expected))
    resolution = 2 * math.pi * 6378137 / (256 * 2**z)
    origin = math.pi * 6378137
    left = x0 * 256 * resolution - origin
    width = (x1 - x0 + 1) * 256
    missing = opaque = absolute_sum = max_difference = edge_max = 0
    for y in range(y0, y1 + 1):
        top = origin - y * 256 * resolution
        tiles = []
        for x in range(x0, x1 + 1):
            tile = gdal.Open(str(a.tiles / str(z) / str(x) / f"{y}.png")).ReadAsArray()
            # GDAL omits the alpha band for entirely opaque PNGs.
            if tile.shape == (3, 256, 256):
                tile = np.concatenate(
                    [tile, np.full((1, 256, 256), 255, dtype=np.uint8)]
                )
            assert tile.shape == (4, 256, 256), tile.shape
            tiles.append(tile)
        row = np.concatenate(tiles, axis=2)
        reference = gdal.Warp(
            "",
            str(a.source),
            format="MEM",
            outputBounds=[left, top - 256 * resolution, left + width * resolution, top],
            width=width,
            height=256,
            dstSRS="EPSG:3857",
            resampleAlg="bilinear",
            srcAlpha=True,
            dstAlpha=True,
        ).ReadAsArray()
        missing += int(np.count_nonzero((reference[3] > 0) & (row[3] == 0)))
        selected = (reference[3] == 255) & (row[3] == 255)
        diff = np.abs(row[:3].astype(np.int16) - reference[:3].astype(np.int16))
        if selected.any():
            max_difference = max(max_difference, int(diff[:, selected].max()))
            absolute_sum += int(diff[:, selected].sum())
            opaque += int(selected.sum())
        edge = np.zeros(selected.shape, dtype=bool)
        edge[[0, 255], :] = True
        edge[:, ::256] = True
        edge[:, 255::256] = True
        if (edge & selected).any():
            edge_max = max(edge_max, int(diff[:, edge & selected].max()))
    result = {
        "source_sha256": digest(a.source),
        "inventory_sha256": digest(inventory_path),
        "tile_count": len(inventory),
        "complete_xyz_pyramids": True,
        "native_zoom": z,
        "missing_source_coverage_cells": missing,
        "opaque_cells_compared": opaque,
        "opaque_rgb_max_difference": max_difference,
        "opaque_rgb_mean_difference": absolute_sum / (3 * opaque),
        "tile_edge_opaque_rgb_max_difference": edge_max,
        "rgb_tolerance": "One 8-bit level: strip and tile sampling can round at a half value; exact-zero diagnostic retained separately",
        "scope": "Tile mechanics only. Source geographic gaps are retained, not certified or filled.",
    }
    a.out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    assert missing == 0 and max_difference <= 1 and edge_max <= 1, result


if __name__ == "__main__":
    main()
