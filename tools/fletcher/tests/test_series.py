from __future__ import annotations

import unittest
import pathlib

from tools.fletcher.download_series import sheet_destination
from tools.fletcher.series import PRIORITY_SHEETS


class SeriesTests(unittest.TestCase):
    def test_priority_starts_with_proven_sheet_then_rest_of_cape_breton(self) -> None:
        self.assertEqual(
            [sheet.number for sheet in PRIORITY_SHEETS[:8]],
            list(range(17, 25)),
        )

    def test_series_contains_each_single_sheet_once(self) -> None:
        numbers = [sheet.number for sheet in PRIORITY_SHEETS]
        ids = [sheet.rumsey_id for sheet in PRIORITY_SHEETS]

        self.assertEqual(sorted(numbers), list(range(1, 25)))
        self.assertEqual(len(ids), len(set(ids)))
        self.assertNotIn("280038", " ".join(ids))
        self.assertNotIn("280039", " ".join(ids))

    def test_each_sheet_has_an_isolated_region_cache(self) -> None:
        root = pathlib.Path("/compute/root")

        self.assertEqual(
            sheet_destination(root, "sheet-18"),
            root / "work" / "sheet-18",
        )
        self.assertNotEqual(
            sheet_destination(root, "sheet-18"),
            sheet_destination(root, "sheet-19"),
        )


if __name__ == "__main__":
    unittest.main()
