import math
import unittest

from tools.church.geometry import (
    EARTH_RADIUS_M,
    lonlat_to_mercator,
    mercator_to_ground_metres,
    mercator_to_lonlat,
)


class MercatorTests(unittest.TestCase):
    def test_origin_maps_to_origin(self) -> None:
        x, y = lonlat_to_mercator(0.0, 0.0)
        self.assertAlmostEqual(x, 0.0, places=6)
        self.assertAlmostEqual(y, 0.0, places=6)

    def test_antimeridian_maps_to_half_circumference(self) -> None:
        x, _ = lonlat_to_mercator(180.0, 0.0)
        self.assertAlmostEqual(x, math.pi * EARTH_RADIUS_M, places=3)

    def test_roundtrip_at_inverness(self) -> None:
        lon, lat = -61.2, 46.2
        back_lon, back_lat = mercator_to_lonlat(*lonlat_to_mercator(lon, lat))
        self.assertAlmostEqual(back_lon, lon, places=9)
        self.assertAlmostEqual(back_lat, lat, places=9)

    def test_northern_latitudes_have_larger_y(self) -> None:
        _, south = lonlat_to_mercator(-61.0, 45.0)
        _, north = lonlat_to_mercator(-61.0, 47.0)
        self.assertGreater(north, south)


class GroundDistanceTests(unittest.TestCase):
    def test_no_correction_at_the_equator(self) -> None:
        self.assertAlmostEqual(mercator_to_ground_metres(1000.0, 0.0), 1000.0, places=6)

    def test_inverness_latitude_shrinks_distance_by_cosine(self) -> None:
        # This is the whole point of the function: 1000 Mercator metres at 46N
        # is only ~695 m on the ground. Reporting the uncorrected number would
        # overstate positional error by ~44%.
        self.assertAlmostEqual(
            mercator_to_ground_metres(1000.0, 46.0),
            1000.0 * math.cos(math.radians(46.0)),
            places=6,
        )
        self.assertAlmostEqual(mercator_to_ground_metres(1000.0, 46.0), 694.658, places=2)

    def test_correction_is_symmetric_across_the_equator(self) -> None:
        self.assertAlmostEqual(
            mercator_to_ground_metres(500.0, 46.0),
            mercator_to_ground_metres(500.0, -46.0),
            places=9,
        )


if __name__ == "__main__":
    unittest.main()
