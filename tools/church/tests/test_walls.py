import unittest

from tools.church.walls import ExtractWalls, detect_extract_walls

# A coastline wiggling between lon -60.95 and -60.90, cut off at lon -61.0 by
# the edge of the data extract. The cut leaves many vertices sharing that exact
# longitude; no real shoreline does that.
WIGGLE = [(-60.95 + 0.001 * i, 46.5 + 0.002 * i) for i in range(40)]
SEAM = [(-61.0, 46.5 + 0.002 * i) for i in range(30)]


class DetectTests(unittest.TestCase):
    def test_finds_a_longitude_seam(self) -> None:
        walls = detect_extract_walls(WIGGLE + SEAM, min_repeats=10)
        self.assertEqual([round(v, 6) for v in walls.longitudes], [-61.0])
        self.assertEqual(walls.latitudes, ())

    def test_leaves_a_natural_coastline_alone(self) -> None:
        walls = detect_extract_walls(WIGGLE, min_repeats=10)
        self.assertEqual(walls.longitudes, ())
        self.assertEqual(walls.latitudes, ())

    def test_finds_a_latitude_seam(self) -> None:
        seam = [(-60.9 + 0.001 * i, 46.75) for i in range(30)]
        walls = detect_extract_walls(WIGGLE + seam, min_repeats=10)
        self.assertEqual([round(v, 6) for v in walls.latitudes], [46.75])

    def test_threshold_is_respected(self) -> None:
        self.assertEqual(detect_extract_walls(WIGGLE + SEAM, min_repeats=31).longitudes, ())


class MembershipTests(unittest.TestCase):
    def test_a_point_on_the_seam_is_recognised(self) -> None:
        walls = ExtractWalls(longitudes=(-61.0,), latitudes=(46.75,))
        self.assertTrue(walls.contains(-61.0, 46.5, tolerance=1e-4))
        self.assertTrue(walls.contains(-60.9, 46.75, tolerance=1e-4))

    def test_a_point_off_the_seam_is_not(self) -> None:
        walls = ExtractWalls(longitudes=(-61.0,), latitudes=(46.75,))
        self.assertFalse(walls.contains(-60.95, 46.60, tolerance=1e-4))

    def test_tolerance_is_honoured(self) -> None:
        walls = ExtractWalls(longitudes=(-61.0,), latitudes=())
        self.assertFalse(walls.contains(-60.99, 46.5, tolerance=1e-4))
        self.assertTrue(walls.contains(-60.99, 46.5, tolerance=0.02))

    def test_no_walls_means_nothing_is_excluded(self) -> None:
        self.assertFalse(ExtractWalls((), ()).contains(-61.0, 46.75, tolerance=1.0))


if __name__ == "__main__":
    unittest.main()
