"""Unit tests for the pure geometry helpers in tools.fletcher.feature_qa.

Only the pure helpers (`qa_grid_centers`, `crop_window`, `merc_to_crop_px`)
are exercised here. `render_scan_crop` and `render_overlay` lazily import
cv2/numpy and shell out to `gdal_translate`; CI has none of those, so those
functions are exercised on the remote GIS host, not in this suite.
"""

from __future__ import annotations

import unittest

from tools.fletcher.feature_qa import crop_window, merc_to_crop_px, qa_grid_centers


class QaGridCentersTests(unittest.TestCase):
    """`qa_grid_centers`: n^2 count, half-cell inset, row-major order."""

    def test_returns_n_squared_centers(self) -> None:
        frame = [[0.0, 0.0], [100.0, 0.0], [100.0, 50.0], [0.0, 50.0]]
        centers = qa_grid_centers(frame, n=4)
        self.assertEqual(len(centers), 16)

    def test_default_n_is_four(self) -> None:
        frame = [[0.0, 0.0], [100.0, 0.0], [100.0, 50.0], [0.0, 50.0]]
        centers = qa_grid_centers(frame)
        self.assertEqual(len(centers), 16)

    def test_corner_centers_are_half_cell_inset(self) -> None:
        frame = [[0.0, 0.0], [100.0, 0.0], [100.0, 50.0], [0.0, 50.0]]
        n = 4
        centers = qa_grid_centers(frame, n=n)
        cell_w = 100.0 / n
        cell_h = 50.0 / n
        # Row-major: centers[0] is row 0, col 0 (top-left cell of the grid).
        self.assertAlmostEqual(centers[0][0], cell_w / 2)
        self.assertAlmostEqual(centers[0][1], cell_h / 2)
        # centers[-1] is row n-1, col n-1 (bottom-right cell).
        self.assertAlmostEqual(centers[-1][0], 100.0 - cell_w / 2)
        self.assertAlmostEqual(centers[-1][1], 50.0 - cell_h / 2)

    def test_row_major_order(self) -> None:
        frame = [[0.0, 0.0], [40.0, 0.0], [40.0, 40.0], [0.0, 40.0]]
        centers = qa_grid_centers(frame, n=2)
        expected = [
            (10.0, 10.0),
            (30.0, 10.0),
            (10.0, 30.0),
            (30.0, 30.0),
        ]
        self.assertEqual(len(centers), len(expected))
        for (expected_x, expected_y), (actual_x, actual_y) in zip(expected, centers):
            self.assertAlmostEqual(expected_x, actual_x)
            self.assertAlmostEqual(expected_y, actual_y)

    def test_bounding_box_is_taken_from_all_four_corners(self) -> None:
        frame = [[10.0, 5.0], [110.0, 5.0], [110.0, 55.0], [10.0, 55.0]]
        centers = qa_grid_centers(frame, n=1)
        self.assertEqual(len(centers), 1)
        self.assertAlmostEqual(centers[0][0], 60.0)
        self.assertAlmostEqual(centers[0][1], 30.0)


class CropWindowTests(unittest.TestCase):
    """`crop_window`: centered when unclamped, shifted (not shrunk) at edges."""

    def test_centered_when_unclamped(self) -> None:
        x, y, w, h = crop_window((500.0, 500.0), 256, 2000, 2000)
        self.assertEqual((w, h), (256, 256))
        self.assertEqual(x + w / 2, 500.0)
        self.assertEqual(y + h / 2, 500.0)

    def test_shifted_at_left_edge(self) -> None:
        x, y, w, h = crop_window((10.0, 500.0), 256, 2000, 2000)
        self.assertEqual(x, 0)
        self.assertEqual(w, 256)

    def test_shifted_at_top_edge(self) -> None:
        x, y, w, h = crop_window((500.0, 5.0), 256, 2000, 2000)
        self.assertEqual(y, 0)
        self.assertEqual(h, 256)

    def test_shifted_at_right_edge(self) -> None:
        x, y, w, h = crop_window((1995.0, 500.0), 256, 2000, 2000)
        self.assertEqual(x + w, 2000)
        self.assertEqual(w, 256)

    def test_shifted_at_bottom_edge(self) -> None:
        x, y, w, h = crop_window((500.0, 1995.0), 256, 2000, 2000)
        self.assertEqual(y + h, 2000)
        self.assertEqual(h, 256)

    def test_shifted_at_top_left_corner(self) -> None:
        x, y, w, h = crop_window((2.0, 3.0), 256, 2000, 2000)
        self.assertEqual((x, y), (0, 0))
        self.assertEqual((w, h), (256, 256))

    def test_shifted_at_bottom_right_corner(self) -> None:
        x, y, w, h = crop_window((1998.0, 1997.0), 256, 2000, 2000)
        self.assertEqual((x + w, y + h), (2000, 2000))
        self.assertEqual((w, h), (256, 256))

    def test_degenerate_raster_smaller_than_window_caps_size_at_origin(self) -> None:
        x, y, w, h = crop_window((50.0, 40.0), 256, 100, 80)
        self.assertEqual((x, y), (0, 0))
        self.assertEqual((w, h), (100, 80))


class MercToCropPxTests(unittest.TestCase):
    """`merc_to_crop_px`: corners to (0,0)/(w,h), midpoint centered, y inverted."""

    projwin = (-100.0, 200.0, 100.0, 0.0)  # ulx, uly, lrx, lry
    out_size = (400, 800)  # w, h

    def test_upper_left_corner_maps_to_pixel_origin(self) -> None:
        px, py = merc_to_crop_px((-100.0, 200.0), self.projwin, self.out_size)
        self.assertAlmostEqual(px, 0.0)
        self.assertAlmostEqual(py, 0.0)

    def test_lower_right_corner_maps_to_out_size(self) -> None:
        px, py = merc_to_crop_px((100.0, 0.0), self.projwin, self.out_size)
        self.assertAlmostEqual(px, 400.0)
        self.assertAlmostEqual(py, 800.0)

    def test_midpoint_maps_to_crop_center(self) -> None:
        px, py = merc_to_crop_px((0.0, 100.0), self.projwin, self.out_size)
        self.assertAlmostEqual(px, 200.0)
        self.assertAlmostEqual(py, 400.0)

    def test_y_axis_is_inverted_relative_to_northing(self) -> None:
        # uly (greater northing, the top of a north-up crop) must land at
        # pixel row 0; lry (lesser northing, the bottom) at pixel row h.
        _, top_py = merc_to_crop_px((0.0, 200.0), self.projwin, self.out_size)
        _, bottom_py = merc_to_crop_px((0.0, 0.0), self.projwin, self.out_size)
        self.assertAlmostEqual(top_py, 0.0)
        self.assertAlmostEqual(bottom_py, 800.0)
        self.assertLess(top_py, bottom_py)


if __name__ == "__main__":
    unittest.main()
