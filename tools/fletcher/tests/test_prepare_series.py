from __future__ import annotations

import unittest

from tools.fletcher import prepare_series
from tools.fletcher.grids import REVIEWED_GRIDS
from tools.fletcher.prepare_series import build_observation


class PrepareSeriesTests(unittest.TestCase):
    def test_sheet_filter_selects_only_the_requested_disposition(self) -> None:
        self.assertTrue(hasattr(prepare_series, "select_dispositions"))

        reviewed, rejected = prepare_series.select_dispositions([23])

        self.assertEqual([number for number, _ in reviewed], [23])
        self.assertEqual(rejected, [])

    def test_observation_preserves_individual_pixels_and_preassigned_checks(self) -> None:
        observation = build_observation(
            23,
            REVIEWED_GRIDS[23],
            rumsey_id="rumsey-23",
            source_sha256="sheet-23-sha",
        )

        self.assertEqual(
            observation["check_intersections"],
            [[0, 0], [3, 1]],
        )
        self.assertEqual(
            observation["intersections"][0],
            {
                "meridian_index": 0,
                "parallel_index": 0,
                "pixel_x": 2_539.0,
                "pixel_y": 3_505.0,
            },
        )
        self.assertNotIn("pixel_x", observation["meridians"][0])
        self.assertNotIn("pixel_y", observation["parallels"][0])

    def test_observation_preserves_source_receipt_and_reviewed_roles(self) -> None:
        observation = build_observation(
            4,
            REVIEWED_GRIDS[4],
            rumsey_id="rumsey-4",
            source_sha256="abc123",
        )

        self.assertEqual(observation["sheet"], "sheet-04")
        self.assertEqual(observation["rumsey_id"], "rumsey-4")
        self.assertEqual(observation["source_sha256"], "abc123")
        self.assertEqual(len(observation["meridians"]), 4)
        self.assertGreaterEqual(len(observation["check_intersections"]), 2)


if __name__ == "__main__":
    unittest.main()
