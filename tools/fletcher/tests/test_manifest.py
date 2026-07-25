from __future__ import annotations

import json
import pathlib
import tempfile
import unittest
from unittest import mock

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

    def test_modern_result_changes_only_sheet_24_namespace(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "manifest.json"
            before = {
                "version": 1,
                "sheets": {
                    "23": {"stage": "tiled", "gate": "PASS", "tile_png_count": 7834},
                    "24": {
                        "stage": "failed",
                        "gate": "FAIL",
                        "reason": "automatic graticule detection found no reviewable regular sequence",
                        "rumsey_id": "RUMSEY~8~1~2649~290017",
                    },
                },
            }
            modern = {"method_version": "modern-feature-v1", "disposition": "PASS"}
            path.write_text(json.dumps(before) + "\n", encoding="utf-8")

            Manifest(path).update_namespace("24", "modern_feature_v1", modern)

            after = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(after["sheets"]["23"], before["sheets"]["23"])
            self.assertEqual(
                {
                    key: value
                    for key, value in after["sheets"]["24"].items()
                    if key != "modern_feature_v1"
                },
                before["sheets"]["24"],
            )
            self.assertEqual(after["sheets"]["24"]["modern_feature_v1"], modern)
            self.assertFalse(path.with_suffix(".json.tmp").exists())

    def test_namespace_replace_failure_keeps_existing_manifest_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "manifest.json"
            before = b'{"version":1,"sheets":{"24":{"stage":"failed"}}}\n'
            path.write_bytes(before)

            with mock.patch(
                "tools.fletcher.manifest.os.replace",
                side_effect=OSError("replace failed"),
            ):
                with self.assertRaisesRegex(OSError, "replace failed"):
                    Manifest(path).update_namespace(
                        "24", "modern_feature_v1", {"disposition": "PASS"}
                    )

            self.assertEqual(path.read_bytes(), before)
            self.assertFalse(path.with_suffix(".json.tmp").exists())


if __name__ == "__main__":
    unittest.main()
