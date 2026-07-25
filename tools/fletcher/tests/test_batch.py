from __future__ import annotations

import pathlib
import tempfile
import unittest

from tools.fletcher.batch import BatchItem, run_batch
from tools.fletcher.manifest import Manifest


class BatchTests(unittest.TestCase):
    def test_one_sheet_failure_is_recorded_and_does_not_stop_the_next_sheet(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest = Manifest(pathlib.Path(directory) / "manifest.json")
            visited: list[str] = []

            def process(item: BatchItem) -> dict:
                visited.append(item.sheet_id)
                if item.sheet_id == "17":
                    raise RuntimeError("bad lattice")
                return {"stage": "tiled", "tile_count": 12}

            run_batch(
                [
                    BatchItem("17", "rumsey-17"),
                    BatchItem("18", "rumsey-18"),
                ],
                manifest,
                process=process,
                free_bytes=lambda: 100 * 1024**3,
            )

            self.assertEqual(visited, ["17", "18"])
            self.assertEqual(manifest.sheets["17"]["stage"], "failed")
            self.assertEqual(manifest.sheets["17"]["reason"], "bad lattice")
            self.assertEqual(manifest.sheets["18"]["stage"], "tiled")

    def test_completed_sheet_is_skipped_on_resume(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest = Manifest(pathlib.Path(directory) / "manifest.json")
            manifest.update("17", stage="tiled")

            run_batch(
                [BatchItem("17", "rumsey-17")],
                manifest,
                process=lambda _: self.fail("completed sheet was restarted"),
                free_bytes=lambda: 100 * 1024**3,
            )


if __name__ == "__main__":
    unittest.main()
