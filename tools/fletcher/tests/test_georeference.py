from __future__ import annotations

import json
import math
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

from tools.church.gcps import GroundControlPoint
from tools.fletcher.georeference import (
    build_tile_command,
    build_transform_command,
    build_translate_command,
    build_warp_command,
    cutline_feature_collection,
    densify_ring,
    georeference,
    project_cutline,
)
from tools.fletcher.pipeline import CandidateAccuracy


class GeoreferenceCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self.control = GroundControlPoint(
            10.0, 20.0, -60.5, 45.75, "control", "control"
        )
        self.check = GroundControlPoint(
            30.0, 40.0, -60.4, 45.8, "check", "held out"
        )

    def test_translate_excludes_held_out_points_from_the_fit(self) -> None:
        command = build_translate_command(
            "scan.tif",
            "gcps.vrt",
            [self.control, self.check],
        )

        self.assertEqual(command.count("-gcp"), 1)
        self.assertIn("10.0", command)
        self.assertNotIn("30.0", command)

    def test_each_candidate_uses_its_actual_gdal_transform_flag(self) -> None:
        self.assertIn("-tps", build_transform_command("tps", "gcps.vrt"))
        self.assertEqual(
            build_transform_command("affine", "gcps.vrt")[:2],
            ["gdaltransform", "-order"],
        )
        self.assertEqual(
            build_transform_command("polynomial2", "gcps.vrt")[:3],
            ["gdaltransform", "-order", "2"],
        )

    def test_warp_writes_web_mercator_with_alpha_and_bigtiff_safety(self) -> None:
        command = build_warp_command(
            "affine",
            "gcps.vrt",
            "affine.tif",
        )

        self.assertIn("EPSG:3857", command)
        self.assertIn("-dstalpha", command)
        self.assertIn("BIGTIFF=IF_SAFER", command)

    def test_unknown_transform_is_rejected_instead_of_silently_defaulting(self) -> None:
        with self.assertRaisesRegex(ValueError, "unknown transform"):
            build_warp_command("rubber-sheet", "gcps.vrt", "out.tif")

    def test_tiles_use_the_gdal_python_module_when_no_wrapper_is_installed(self) -> None:
        command = build_tile_command(
            pathlib.Path("source.tif"),
            pathlib.Path("tiles"),
            8,
            16,
        )

        self.assertEqual(
            command[:3],
            [sys.executable, "-m", "osgeo_utils.gdal2tiles"],
        )
        self.assertIn("--resume", command)

    def test_only_the_residual_winner_is_rendered_as_a_warp(self) -> None:
        csv = """pixel_x,pixel_y,lon,lat,role,label
0,0,-61,46,control,a
1,0,-60.9,46,control,b
2,0,-60.8,46,control,c
0,1,-61,45.9,control,d
1,1,-60.9,45.9,control,e
2,1,-60.8,45.9,control,f
0,2,-61,45.8,check,g
2,2,-60.8,45.8,check,h
"""
        candidates = [
            CandidateAccuracy("tps", 6, 2, 10.0, 12.0, 12.0),
            CandidateAccuracy("affine", 6, 2, 20.0, 22.0, 22.0),
            CandidateAccuracy("polynomial2", 6, 2, 30.0, 32.0, 32.0),
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            points = root / "points.csv"
            points.write_text(csv, encoding="utf-8")
            with (
                mock.patch(
                    "tools.fletcher.georeference.score_candidate",
                    side_effect=candidates,
                ),
                mock.patch(
                    "tools.fletcher.georeference.subprocess.run",
                ) as run,
            ):
                georeference(root / "source.tif", points, root / "out")

        warp_commands = [
            call.args[0]
            for call in run.call_args_list
            if call.args[0][0] == "gdalwarp"
        ]
        self.assertEqual(len(warp_commands), 1)
        self.assertIn("-tps", warp_commands[0])


if __name__ == "__main__":
    unittest.main()


class CutlineTests(unittest.TestCase):
    """The neat-line mask: densify, project, serialise, and apply."""

    def test_warp_without_a_cutline_is_unchanged(self) -> None:
        command = build_warp_command("tps", "in.vrt", "out.tif")
        self.assertNotIn("-cutline", command)
        self.assertNotIn("-crop_to_cutline", command)

    def test_warp_crops_to_the_cutline_when_one_is_given(self) -> None:
        command = build_warp_command("tps", "in.vrt", "out.tif", cutline="c.geojson")
        self.assertIn("-cutline", command)
        self.assertEqual(command[command.index("-cutline") + 1], "c.geojson")
        # Without -crop_to_cutline gdalwarp masks but keeps the full extent,
        # which would leave the collar as transparent padding around every sheet.
        self.assertIn("-crop_to_cutline", command)

    def test_densify_subdivides_every_edge_beyond_the_spacing(self) -> None:
        # A TPS bends straight lines; four corners alone would cut a chord
        # across the curve and shave real map content off the edge.
        ring = [(0.0, 0.0), (1000.0, 0.0), (1000.0, 1000.0), (0.0, 1000.0)]
        dense = densify_ring(ring, 250.0)
        self.assertGreater(len(dense), len(ring))
        for (x0, y0), (x1, y1) in zip(dense[:-1], dense[1:], strict=True):
            self.assertLessEqual(round(math.hypot(x1 - x0, y1 - y0), 6), 250.0)

    def test_densify_closes_an_open_ring(self) -> None:
        dense = densify_ring([(0.0, 0.0), (100.0, 0.0), (100.0, 100.0)], 250.0)
        self.assertEqual(dense[0], dense[-1])

    def test_densify_rejects_a_degenerate_frame(self) -> None:
        with self.assertRaises(ValueError):
            densify_ring([(0.0, 0.0), (1.0, 1.0)], 250.0)
        with self.assertRaises(ValueError):
            densify_ring([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)], 0.0)

    def test_cutline_declares_the_projected_crs_not_pixel_space(self) -> None:
        # gdalwarp reads the ring in the target CRS; mislabelling it as pixels
        # would silently place the mask somewhere in the Atlantic.
        payload = json.loads(cutline_feature_collection(
            [(-6770641.7, 5964514.0), (-6727228.2, 5964788.3),
             (-6727302.7, 5936870.7), (-6770716.1, 5936596.3)]
        ))
        self.assertEqual(
            payload["crs"]["properties"]["name"], "urn:ogc:def:crs:EPSG::3857"
        )
        ring = payload["features"][0]["geometry"]["coordinates"][0]
        self.assertEqual(ring[0], ring[-1], "polygon ring must close")

    def test_projection_refuses_a_short_transform_result(self) -> None:
        # gdaltransform dropping vertices would yield a smaller mask that
        # quietly clips map content, so a count mismatch must raise.
        ring = [(0.0, 0.0), (1000.0, 0.0), (1000.0, 1000.0), (0.0, 1000.0)]
        with mock.patch(
            "tools.fletcher.georeference.subprocess.run",
            return_value=mock.Mock(stdout="0 0 0\n1 1 0\n"),
        ):
            with self.assertRaises(ValueError):
                project_cutline(ring, "tps", pathlib.Path("in.vrt"))
