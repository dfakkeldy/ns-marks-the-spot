import math
import unittest

from tools.church.counties import get_county
from tools.church.gcps import CHECK_ROLE, CONTROL_ROLE, GroundControlPoint
from tools.church.georeference import (
    build_gcp_arguments,
    build_metadata,
    build_translate_command,
    check_errors,
    parse_gdaltransform_output,
    warp_command,
)
from tools.church.panels import SourceWindow
from tools.church.residuals import summarise


class GcpArgumentTests(unittest.TestCase):
    def test_emits_one_flag_group_per_point(self) -> None:
        points = [
            GroundControlPoint(10.0, 20.0, -61.0, 46.0, CONTROL_ROLE, "a"),
            GroundControlPoint(30.0, 40.0, -61.1, 46.1, CONTROL_ROLE, "b"),
        ]
        args = build_gcp_arguments(points)
        self.assertEqual(args.count("-gcp"), 2)
        self.assertEqual(len(args), 10)
        self.assertEqual(args[0], "-gcp")
        self.assertEqual(args[1], "10.0")
        self.assertEqual(args[2], "20.0")

    def test_only_control_points_reach_gdal(self) -> None:
        points = [
            GroundControlPoint(10.0, 20.0, -61.0, 46.0, CONTROL_ROLE, "a"),
            GroundControlPoint(30.0, 40.0, -61.1, 46.1, CHECK_ROLE, "held out"),
        ]
        self.assertEqual(build_gcp_arguments(points).count("-gcp"), 1)

    def test_translate_command_crops_and_shifts_panel_gcps(self) -> None:
        window = SourceWindow(x=12500, y=1000, width=21000, height=32000)
        points = [
            GroundControlPoint(19358.0, 10189.0, -61.392397, 46.071979, CONTROL_ROLE, "Mabou"),
            GroundControlPoint(20134.0, 12615.0, -61.348218, 46.08906, CHECK_ROLE, "check"),
        ]

        command = build_translate_command("source.jp2", "panel.tif", points, window)

        self.assertEqual(
            command[command.index("-srcwin") + 1 : command.index("-srcwin") + 5],
            ["12500", "1000", "21000", "32000"],
        )
        gcp_index = command.index("-gcp")
        self.assertEqual(command[gcp_index + 1 : gcp_index + 3], ["6858.0", "9189.0"])
        self.assertEqual(command.count("-gcp"), 1)
        self.assertIn("COMPRESS=DEFLATE", command)
        self.assertIn("TILED=YES", command)
        self.assertIn("BIGTIFF=IF_SAFER", command)


class WarpCommandTests(unittest.TestCase):
    def test_uses_thin_plate_spline_and_web_mercator(self) -> None:
        command = warp_command("in.tif", "out.tif")
        self.assertIn("-tps", command)
        self.assertIn("-t_srs", command)
        self.assertIn("EPSG:3857", command)
        self.assertEqual(command[0], "gdalwarp")
        self.assertIn("BIGTIFF=IF_SAFER", command)

    def test_affine_mode_omits_tps(self) -> None:
        self.assertNotIn("-tps", warp_command("in.tif", "out.tif", tps=False))


class TransformParsingTests(unittest.TestCase):
    def test_parses_gdaltransform_triples(self) -> None:
        text = "-6801234.5 5812345.6 0\n-6801000.0 5812000.0 0\n"
        self.assertEqual(
            parse_gdaltransform_output(text),
            [(-6801234.5, 5812345.6), (-6801000.0, 5812000.0)],
        )

    def test_ignores_blank_lines(self) -> None:
        self.assertEqual(len(parse_gdaltransform_output("1.0 2.0 0\n\n3.0 4.0 0\n\n")), 2)


class CheckErrorTests(unittest.TestCase):
    def test_perfect_transform_gives_zero_error(self) -> None:
        point = GroundControlPoint(0.0, 0.0, -61.0, 46.0, CHECK_ROLE, "x")
        self.assertAlmostEqual(check_errors([point], [point.mercator])[0], 0.0, places=6)

    def test_error_is_cosine_corrected_ground_distance(self) -> None:
        point = GroundControlPoint(0.0, 0.0, -61.0, 46.0, CHECK_ROLE, "x")
        actual_x, actual_y = point.mercator
        errors = check_errors([point], [(actual_x + 1000.0, actual_y)])
        self.assertAlmostEqual(errors[0], 1000.0 * math.cos(math.radians(46.0)), places=3)

    def test_length_mismatch_is_rejected(self) -> None:
        point = GroundControlPoint(0.0, 0.0, -61.0, 46.0, CHECK_ROLE, "x")
        with self.assertRaises(ValueError):
            check_errors([point], [])


class MetadataTests(unittest.TestCase):
    def _report(self):
        points = [
            GroundControlPoint(0.0, 0.0, -61.0, 46.0, CONTROL_ROLE, "a"),
            GroundControlPoint(100.0, 0.0, -60.9, 46.0, CONTROL_ROLE, "b"),
            GroundControlPoint(0.0, 100.0, -61.0, 46.1, CONTROL_ROLE, "c"),
        ]
        return summarise(points, [], check_errors_m=[25.0, 35.0])

    def test_carries_provenance_and_accuracy(self) -> None:
        metadata = build_metadata(
            county=get_county("inverness"),
            report=self._report(),
            zoom_min=8,
            zoom_max=16,
            source_url="https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~353591~90120835",
            retrieved="2026-07-24",
        )
        self.assertEqual(metadata["county"], "Inverness")
        self.assertEqual(metadata["layer_id"], "church-inverness")
        self.assertEqual(metadata["published_year"], 1884)
        self.assertEqual(metadata["rumsey_id"], "RUMSEY~8~1~353591~90120835")
        self.assertEqual(metadata["retrieved"], "2026-07-24")
        self.assertEqual(metadata["zoom"], {"min": 8, "max": 16})
        self.assertEqual(metadata["srs"], "EPSG:3857")
        self.assertIn("check_rms_m", metadata["accuracy"])

    def test_records_the_rumsey_licence(self) -> None:
        metadata = build_metadata(
            county=get_county("inverness"),
            report=self._report(),
            zoom_min=8,
            zoom_max=16,
            source_url="https://example.invalid",
            retrieved="2026-07-24",
        )
        self.assertIn("Rumsey", metadata["attribution"])
        self.assertIn("davidrumsey.com", metadata["licence_url"])

    def test_is_json_serialisable(self) -> None:
        import json

        metadata = build_metadata(
            county=get_county("inverness"),
            report=self._report(),
            zoom_min=8,
            zoom_max=16,
            source_url="https://example.invalid",
            retrieved="2026-07-24",
        )
        self.assertIsInstance(json.dumps(metadata), str)


if __name__ == "__main__":
    unittest.main()
