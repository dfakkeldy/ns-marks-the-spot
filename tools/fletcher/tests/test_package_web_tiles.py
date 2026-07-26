from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.fletcher.package_web_tiles import (
    Tile,
    duplicate_inventory,
    latitude_for_tile_y,
    sha256_file,
    sheet_bounds,
)


class PackageWebTilesTests(unittest.TestCase):
    def test_duplicate_inventory_keeps_sheet_namespaces(self) -> None:
        tiles = [
            Tile(1, 8, 84, 90, Path("/tmp/one.png")),
            Tile(2, 8, 84, 90, Path("/tmp/two.png")),
            Tile(2, 8, 85, 90, Path("/tmp/three.png")),
        ]

        self.assertEqual(
            duplicate_inventory(tiles),
            [
                {
                    "key": "8/84/90.png",
                    "members": [
                        "sheet-01/8/84/90.png",
                        "sheet-02/8/84/90.png",
                    ],
                }
            ],
        )

    def test_sheet_bounds_use_complete_max_zoom_tile_edges(self) -> None:
        tiles = [
            Tile(1, 16, 21_800, 23_300, Path("/tmp/one.png")),
            Tile(1, 16, 21_801, 23_301, Path("/tmp/two.png")),
        ]

        bounds = sheet_bounds(tiles)[1]

        self.assertAlmostEqual(bounds["west"], (21_800 / 2**16) * 360 - 180)
        self.assertAlmostEqual(bounds["east"], (21_802 / 2**16) * 360 - 180)
        self.assertAlmostEqual(bounds["north"], latitude_for_tile_y(23_300, 16))
        self.assertAlmostEqual(bounds["south"], latitude_for_tile_y(23_302, 16))

    def test_png_hash_is_over_encoded_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tile.png"
            path.write_bytes(b"encoded png bytes")
            receipt = {"sha256": sha256_file(path)}
            encoded = json.dumps(receipt)

        self.assertIn(sha256_file.__name__.replace("_file", ""), encoded)


if __name__ == "__main__":
    unittest.main()
