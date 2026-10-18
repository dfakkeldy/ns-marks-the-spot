import unittest

from tools.church.landmarks import (
    BoundingBox,
    Island,
    extreme_vertex,
    interior_rings,
    islands_within,
    polygon_centroid,
    vertices_of,
)

BOX = BoundingBox(west=-61.2, south=46.4, east=-61.0, north=46.6)


class BoundingBoxTests(unittest.TestCase):
    def test_contains_is_inclusive_on_the_edge(self):
        self.assertTrue(BOX.contains(-61.2, 46.4))
        self.assertTrue(BOX.contains(-61.0, 46.6))

    def test_excludes_points_outside(self):
        self.assertFalse(BOX.contains(-60.9, 46.5))

    def test_rejects_a_degenerate_box(self):
        with self.assertRaises(ValueError):
            BoundingBox(west=-61.0, south=46.0, east=-61.0, north=46.5)

    def test_rejects_an_inverted_box(self):
        with self.assertRaises(ValueError):
            BoundingBox(west=-60.0, south=46.0, east=-61.0, north=46.5)


class VerticesOfTests(unittest.TestCase):
    def test_reads_a_polygon(self):
        geometry = {"type": "Polygon", "coordinates": [[[-61.1, 46.5], [-61.0, 46.5]]]}
        self.assertEqual(vertices_of(geometry), [(-61.1, 46.5), (-61.0, 46.5)])

    def test_reads_a_multipolygon_at_any_depth(self):
        # NSTDB mixes Polygon and MultiPolygon in one layer, and the distinction
        # is irrelevant to "where is the coastline".
        geometry = {
            "type": "MultiPolygon",
            "coordinates": [[[[-61.1, 46.5]]], [[[-61.0, 46.4]]]],
        }
        self.assertEqual(vertices_of(geometry), [(-61.1, 46.5), (-61.0, 46.4)])

    def test_empty_geometry(self):
        self.assertEqual(vertices_of({}), [])


class ExtremeVertexTests(unittest.TestCase):
    def setUp(self):
        self.vertices = [
            (-61.15, 46.50),   # westernmost inside the box
            (-61.05, 46.55),   # northernmost inside the box
            (-61.02, 46.45),   # easternmost and southernmost inside the box
            (-61.90, 46.50),   # far outside: must never win
        ]

    def test_picks_the_named_extremity(self):
        self.assertEqual(extreme_vertex(self.vertices, BOX, "west"), (-61.15, 46.50))
        self.assertEqual(extreme_vertex(self.vertices, BOX, "east"), (-61.02, 46.45))
        self.assertEqual(extreme_vertex(self.vertices, BOX, "north"), (-61.05, 46.55))
        self.assertEqual(extreme_vertex(self.vertices, BOX, "south"), (-61.02, 46.45))

    def test_the_box_confines_the_search(self):
        # Without the box the far-western vertex would win every "west" query,
        # which is how one headland's rule silently starts describing another.
        self.assertNotEqual(extreme_vertex(self.vertices, BOX, "west"), (-61.90, 46.50))

    def test_rejects_an_unknown_rule(self):
        with self.assertRaises(ValueError):
            extreme_vertex(self.vertices, BOX, "northwest")

    def test_rejects_an_empty_box(self):
        with self.assertRaises(ValueError) as caught:
            extreme_vertex([(-50.0, 40.0)], BOX, "west")
        self.assertIn("no coastline vertices", str(caught.exception))


class PolygonCentroidTests(unittest.TestCase):
    def test_centroid_of_a_square(self):
        square = [(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)]
        lon, lat, area = polygon_centroid(square)
        self.assertAlmostEqual(lon, 1.0)
        self.assertAlmostEqual(lat, 1.0)
        self.assertAlmostEqual(area, 4.0)

    def test_winding_does_not_change_the_answer(self):
        square = [(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)]
        forward = polygon_centroid(square)
        backward = polygon_centroid(list(reversed(square)))
        self.assertAlmostEqual(forward[0], backward[0])
        self.assertAlmostEqual(forward[1], backward[1])
        self.assertAlmostEqual(forward[2], backward[2])

    def test_a_closed_ring_matches_an_open_one(self):
        square = [(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)]
        self.assertAlmostEqual(
            polygon_centroid(square)[0], polygon_centroid(square + [(0.0, 0.0)])[0]
        )

    def test_rejects_a_degenerate_ring(self):
        with self.assertRaises(ValueError):
            polygon_centroid([(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)])

    def test_rejects_too_few_points(self):
        with self.assertRaises(ValueError):
            polygon_centroid([(0.0, 0.0), (1.0, 1.0)])


class IslandTests(unittest.TestCase):
    def feature(self, exterior, *holes):
        return {"geometry": {"type": "Polygon", "coordinates": [exterior, *holes]}}

    def test_interior_rings_are_the_islands(self):
        sea = [(-62.0, 45.0), (-60.0, 45.0), (-60.0, 47.0), (-62.0, 47.0)]
        island = [(-61.15, 46.45), (-61.05, 46.45), (-61.05, 46.55), (-61.15, 46.55)]
        rings = interior_rings(self.feature(sea, island)["geometry"])
        self.assertEqual(len(rings), 1)
        self.assertEqual(len(rings[0]), 4)

    def test_the_exterior_ring_is_not_an_island(self):
        sea = [(-62.0, 45.0), (-60.0, 45.0), (-60.0, 47.0), (-62.0, 47.0)]
        self.assertEqual(interior_rings(self.feature(sea)["geometry"]), [])

    def test_islands_are_ranked_largest_first(self):
        sea = [(-62.0, 45.0), (-60.0, 45.0), (-60.0, 47.0), (-62.0, 47.0)]
        small = [(-61.10, 46.50), (-61.09, 46.50), (-61.09, 46.51), (-61.10, 46.51)]
        large = [(-61.16, 46.44), (-61.06, 46.44), (-61.06, 46.54), (-61.16, 46.54)]
        found = islands_within([self.feature(sea, small, large)], BOX)
        self.assertEqual(len(found), 2)
        self.assertGreater(found[0].area_sq_deg, found[1].area_sq_deg)

    def test_islands_outside_the_box_are_skipped(self):
        sea = [(-62.0, 45.0), (-60.0, 45.0), (-60.0, 47.0), (-62.0, 47.0)]
        far = [(-60.5, 45.1), (-60.4, 45.1), (-60.4, 45.2), (-60.5, 45.2)]
        self.assertEqual(islands_within([self.feature(sea, far)], BOX), [])

    def test_span_describes_how_drawable_the_island_is(self):
        sea = [(-62.0, 45.0), (-60.0, 45.0), (-60.0, 47.0), (-62.0, 47.0)]
        island = [(-61.16, 46.44), (-61.06, 46.44), (-61.06, 46.54), (-61.16, 46.54)]
        found = islands_within([self.feature(sea, island)], BOX)
        self.assertAlmostEqual(found[0].span_lon, 0.10, places=6)
        self.assertAlmostEqual(found[0].span_lat, 0.10, places=6)

    def test_a_non_polygon_geometry_contributes_nothing(self):
        self.assertEqual(interior_rings({"type": "LineString", "coordinates": []}), [])
        self.assertIsInstance(Island(0.0, 0.0, 1.0, 1.0, 1.0), Island)


if __name__ == "__main__":
    unittest.main()
