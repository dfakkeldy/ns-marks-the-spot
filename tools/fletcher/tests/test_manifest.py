from __future__ import annotations

import pathlib
import tempfile
import unittest

from tools.fletcher.manifest import Manifest, may_fetch_new_scan


class ManifestTests(unittest.TestCase):
    def test_update_persists_one_sheet_without_discarding_other_checkpoints(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "manifest.json"
            manifest = Manifest(path)
            manifest.update("17", stage="tiled", tile_count=42)
            manifest.update("18", stage="failed", reason="no graticule")

            reloaded = Manifest(path)
            self.assertEqual(reloaded.sheets["17"]["tile_count"], 42)
            self.assertEqual(reloaded.sheets["18"]["reason"], "no graticule")
            self.assertEqual(reloaded.sheets["17"]["stage"], "tiled")

    def test_disk_gate_stops_new_fetches_below_40_gib(self) -> None:
        gib = 1024**3

        self.assertFalse(may_fetch_new_scan(40 * gib - 1))
        self.assertTrue(may_fetch_new_scan(40 * gib))


if __name__ == "__main__":
    unittest.main()
