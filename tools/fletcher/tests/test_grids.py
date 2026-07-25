from __future__ import annotations

import unittest

from tools.fletcher.grids import (
    REJECTED_GRIDS,
    REVIEWED_GRIDS,
    check_intersections,
)


class ReviewedGridTests(unittest.TestCase):
    def test_sheet_23_uses_reviewed_individual_intersection_pixels(self) -> None:
        self.assertIn(23, REVIEWED_GRIDS)
        self.assertNotIn(23, REJECTED_GRIDS)

        grid = REVIEWED_GRIDS[23]
        self.assertEqual(len(grid.meridians), 4)
        self.assertEqual(len(grid.parallels), 2)
        self.assertEqual(len(grid.intersections), 8)
        self.assertEqual(
            set(grid.checks),
            {(0, 0), (3, 1)},
        )
        first_meridian_pixels = [
            (point.pixel_x, point.pixel_y)
            for point in grid.intersections
            if point.meridian_index == 0
        ]
        self.assertEqual(
            first_meridian_pixels,
            [(2_539.0, 3_505.0), (2_492.0, 6_127.0)],
        )

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
