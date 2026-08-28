import json
import unittest

from tools.church.cutlines import Cutline
from tools.church.cutline_warp import (
    cutline_geojson,
    densify,
    warp_command_with_cutline,
)


class DensifyTests(unittest.TestCase):
    """A thin-plate spline bends straight lines, so a cutline must be sampled."""

    def test_inserts_points_along_each_edge(self) -> None:
        cutline = Cutline(((0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)))

        dense = densify(cutline, max_spacing=25.0)

        self.assertEqual(len(dense), 16)
        self.assertEqual(dense[0], (0.0, 0.0))
        self.assertIn((25.0, 0.0), dense)
        self.assertIn((50.0, 0.0), dense)

    def test_leaves_short_edges_alone(self) -> None:
        cutline = Cutline(((0.0, 0.0), (10.0, 0.0), (0.0, 10.0)))

        dense = densify(cutline, max_spacing=100.0)

        self.assertEqual(dense, [(0.0, 0.0), (10.0, 0.0), (0.0, 10.0)])

    def test_closes_the_ring_back_to_the_first_vertex(self) -> None:
        cutline = Cutline(((0.0, 0.0), (100.0, 0.0), (0.0, 100.0)))

        dense = densify(cutline, max_spacing=40.0)

        # Every original vertex survives and the walk returns toward the start.
        for vertex in cutline.vertices:
            self.assertIn(vertex, dense)

    def test_rejects_a_non_positive_spacing(self) -> None:
        cutline = Cutline(((0.0, 0.0), (10.0, 0.0), (0.0, 10.0)))

        with self.assertRaisesRegex(ValueError, "max_spacing"):
            densify(cutline, max_spacing=0.0)


class CutlineGeoJSONTests(unittest.TestCase):
    def test_writes_a_closed_polygon_in_the_target_crs(self) -> None:
        text = cutline_geojson([(0.0, 0.0), (10.0, 0.0), (10.0, 10.0)], epsg=3857)

        doc = json.loads(text)
        ring = doc["features"][0]["geometry"]["coordinates"][0]
        self.assertEqual(doc["features"][0]["geometry"]["type"], "Polygon")
        self.assertEqual(ring[0], ring[-1])
        self.assertEqual(len(ring), 4)
        self.assertIn("3857", json.dumps(doc["crs"]))


class WarpCommandTests(unittest.TestCase):
    def test_passes_the_cutline_to_gdalwarp(self) -> None:
        command = warp_command_with_cutline("in.vrt", "out.tif", "cut.geojson")

        self.assertIn("-cutline", command)
        self.assertEqual(command[command.index("-cutline") + 1], "cut.geojson")

    def test_keeps_the_thin_plate_spline_and_alpha_band(self) -> None:
        command = warp_command_with_cutline("in.vrt", "out.tif", "cut.geojson")

        self.assertIn("-tps", command)
        self.assertIn("-dstalpha", command)

    def test_does_not_crop_to_the_cutline_so_panel_extent_stays_comparable(self) -> None:
        """-crop_to_cutline would silently change the output extent between runs."""
        command = warp_command_with_cutline("in.vrt", "out.tif", "cut.geojson")

        self.assertNotIn("-crop_to_cutline", command)


if __name__ == "__main__":
    unittest.main()
