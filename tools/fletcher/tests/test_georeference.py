from __future__ import annotations

import unittest

from tools.church.gcps import GroundControlPoint
from tools.fletcher.georeference import (
    build_transform_command,
    build_translate_command,
    build_warp_command,
)


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


if __name__ == "__main__":
    unittest.main()
