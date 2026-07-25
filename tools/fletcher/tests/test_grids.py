from __future__ import annotations

import unittest

from tools.fletcher.grids import (
    REJECTED_GRIDS,
    REVIEWED_GRIDS,
    check_intersections,
)


class ReviewedGridTests(unittest.TestCase):
    def test_every_single_sheet_has_exactly_one_review_disposition(self) -> None:
        reviewed = set(REVIEWED_GRIDS)
        rejected = set(REJECTED_GRIDS)

        self.assertFalse(reviewed & rejected)
        self.assertEqual(reviewed | rejected, set(range(1, 25)))

    def test_each_reviewed_grid_leaves_six_controls_and_held_out_checks(self) -> None:
        for number, grid in REVIEWED_GRIDS.items():
            with self.subTest(sheet=number):
                checks = check_intersections(
                    len(grid.meridians),
                    len(grid.parallels),
                )
                point_count = len(grid.meridians) * len(grid.parallels)
                self.assertGreaterEqual(point_count - len(checks), 6)
                self.assertGreaterEqual(len(checks), 2)
                self.assertEqual(len(checks), len(set(checks)))


if __name__ == "__main__":
    unittest.main()
