import io
import json
import math
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.chm.build_pilot import MANIFEST, copy_bounded, digest, extract_raster, height_class


class PilotBoundaries(unittest.TestCase):
    def test_actual_palette_boundaries_and_transparency(self):
        pilot = json.loads(MANIFEST.read_text())
        minima = [item["minimum"] for item in pilot["classes"]]
        self.assertEqual([height_class(v, minima) for v in [0, 1.999, 2, 4.999, 5, 10, 15, 20, 30, 100]], [0, 0, 1, 1, 2, 3, 4, 5, 6, 6])
        for value in [-32767, -0.1, math.nan, math.inf, -math.inf]:
            self.assertIsNone(height_class(value, minima))

    def test_download_cap_fails_before_writing_excess_data(self):
        dest = io.BytesIO()
        with self.assertRaisesRegex(ValueError, "storage cap"):
            copy_bounded(io.BytesIO(b"too much"), dest, 3)
        self.assertEqual(dest.getvalue(), b"")

    def test_extracts_only_expected_raster_and_checks_hash_without_overwriting(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = root / "source.zip"
            raster = root / "pilot.tif"
            payload = b"test raster bytes"
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("../escape", b"unrelated")
                z.writestr("pilot.tif", payload)
            sheet = {"filename": "pilot.tif", "rasterBytes": len(payload), "sha256": "wrong"}
            with self.assertRaisesRegex(ValueError, "hash differs"):
                extract_raster(archive, root, sheet)
            self.assertFalse(raster.exists())
            self.assertFalse(raster.with_suffix(".partial").exists())
            partial = raster.with_suffix(".partial")
            partial.write_bytes(b"previous interrupted work")
            with self.assertRaises(FileExistsError):
                extract_raster(archive, root, sheet)
            self.assertEqual(partial.read_bytes(), b"previous interrupted work")
            partial.unlink()
            raster.write_bytes(payload)
            sheet["sha256"] = digest(raster)
            raster.unlink()
            extract_raster(archive, root, sheet)
            self.assertEqual(raster.read_bytes(), payload)
            with self.assertRaises(FileExistsError):
                extract_raster(archive, root, sheet)
            self.assertFalse((root.parent / "escape").exists())


if __name__ == "__main__":
    unittest.main()
