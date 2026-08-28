"""Unit tests for tools.fletcher.feature_qa.

The pure helpers (`qa_grid_centers`, `crop_window`, `merc_to_crop_px`) are
exercised directly. `render_scan_crop` and `render_overlay` lazily import
cv2/numpy and shell out to `gdal_translate`; CI has none of those, so those
functions are exercised on the remote GIS host, not in this suite - but the
CLI plumbing that feeds them (`main`'s `crops`/`overlays` subcommands) *is*
exercised here, by monkeypatching `render_scan_crop`/`render_overlay` at the
module level so only argument-shaping logic is under test.
"""

from __future__ import annotations

import json
import pathlib
import tempfile
import unittest
from unittest import mock

from tools.fletcher.feature_qa import crop_window, main, merc_to_crop_px, qa_grid_centers


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


class CliTests(unittest.TestCase):
    """`main`: unknown/missing subcommand exits nonzero (never a silent 0),
    and `crops`/`overlays` shape their arguments correctly before delegating
    to the (here, mocked) render functions."""

    def test_unknown_subcommand_exits_nonzero(self) -> None:
        with self.assertRaises(SystemExit) as ctx:
            main(["bogus"])
        self.assertNotEqual(ctx.exception.code, 0)

    def test_missing_subcommand_exits_nonzero(self) -> None:
        with self.assertRaises(SystemExit) as ctx:
            main([])
        self.assertNotEqual(ctx.exception.code, 0)

    def test_crops_computes_clamped_window_and_crop_local_polylines(self) -> None:
        # Center is near the right edge of a 2000x2000 raster, so the
        # requested 256x256 window must be shifted left (clamped), not
        # shrunk - exactly like `crop_window`'s own edge-clamping tests.
        points = [
            {
                "id": "c01",
                "pixel": {"x": 1995.0, "y": 500.0},
                "polylines_px": [
                    {"kind": "road", "points": [[1990.0, 495.0], [2000.0, 505.0]]}
                ],
            }
        ]
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            points_path = tmp_path / "points.json"
            points_path.write_text(json.dumps(points), encoding="utf-8")
            out_dir = tmp_path / "out"

            with mock.patch("tools.fletcher.feature_qa.render_scan_crop") as mock_render:
                rc = main(
                    [
                        "crops",
                        "--source",
                        "source.tif",
                        "--points",
                        str(points_path),
                        "--size",
                        "256",
                        "--width",
                        "2000",
                        "--height",
                        "2000",
                        "--out-dir",
                        str(out_dir),
                    ]
                )

        self.assertEqual(rc, 0)
        mock_render.assert_called_once()
        source_arg, window_arg, polylines_arg, out_jpg_arg = mock_render.call_args.args[:4]
        self.assertEqual(source_arg, "source.tif")

        expected_window = crop_window((1995.0, 500.0), 256, 2000, 2000)
        self.assertEqual(window_arg, expected_window)

        origin_x, origin_y, _, _ = expected_window
        self.assertEqual(
            polylines_arg,
            [
                {
                    "kind": "road",
                    "points": [
                        [1990.0 - origin_x, 495.0 - origin_y],
                        [2000.0 - origin_x, 505.0 - origin_y],
                    ],
                }
            ],
        )
        self.assertEqual(out_jpg_arg, out_dir / "c01.jpg")

    def test_overlays_computes_projwin_and_forwards_polylines(self) -> None:
        centers = [
            {
                "id": "o01",
                "merc": {"x": 100.0, "y": 200.0},
                "polylines_merc": [
                    {"kind": "water", "points": [[90.0, 190.0], [110.0, 210.0]]}
                ],
            }
        ]
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            centers_path = tmp_path / "centers.json"
            centers_path.write_text(json.dumps(centers), encoding="utf-8")
            out_dir = tmp_path / "out"

            with mock.patch("tools.fletcher.feature_qa.render_overlay") as mock_render:
                rc = main(
                    [
                        "overlays",
                        "--warped",
                        "warped.tif",
                        "--centers",
                        str(centers_path),
                        "--half-width-m",
                        "1500",
                        "--out-dir",
                        str(out_dir),
                    ]
                )

        self.assertEqual(rc, 0)
        mock_render.assert_called_once()
        warped_arg, projwin_arg, polylines_arg, out_jpg_arg = mock_render.call_args.args[:4]
        self.assertEqual(warped_arg, "warped.tif")
        self.assertEqual(
            projwin_arg,
            (100.0 - 1500.0, 200.0 + 1500.0, 100.0 + 1500.0, 200.0 - 1500.0),
        )
        self.assertEqual(
            polylines_arg,
            [{"kind": "water", "points": [[90.0, 190.0], [110.0, 210.0]]}],
        )
        self.assertEqual(out_jpg_arg, out_dir / "o01.jpg")

    def test_crops_defaults_size_to_1400(self) -> None:
        points = [{"id": "c02", "pixel": {"x": 500.0, "y": 500.0}, "polylines_px": []}]
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            points_path = tmp_path / "points.json"
            points_path.write_text(json.dumps(points), encoding="utf-8")
            out_dir = tmp_path / "out"

            with mock.patch("tools.fletcher.feature_qa.render_scan_crop") as mock_render:
                main(
                    [
                        "crops",
                        "--source",
                        "source.tif",
                        "--points",
                        str(points_path),
                        "--width",
                        "2000",
                        "--height",
                        "2000",
                        "--out-dir",
                        str(out_dir),
                    ]
                )

        _, window_arg, _, _ = mock_render.call_args.args[:4]
        self.assertEqual(window_arg, crop_window((500.0, 500.0), 1400, 2000, 2000))


if __name__ == "__main__":
    unittest.main()
