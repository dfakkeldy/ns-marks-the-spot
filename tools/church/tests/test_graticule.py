import unittest

from tools.church.graticule import GraticuleAnchor, GraticuleMesh, LatticeIndex


class GraticuleAnchorTests(unittest.TestCase):
    """The Inverness north panel, anchored on two printed labels read off the scan."""

    def setUp(self) -> None:
        self.anchor = GraticuleAnchor(
            meridian_index=0,
            meridian_lon=-60.0 - 40.0 / 60.0,
            parallel_index=0,
            parallel_lat=46.0 + 50.0 / 60.0,
            step_minutes=5.0,
        )

    def test_anchor_index_returns_the_anchor_coordinate(self) -> None:
        lon, lat = self.anchor.coordinate(LatticeIndex(0, 0))

        self.assertAlmostEqual(lon, -60.666667, places=5)
        self.assertAlmostEqual(lat, 46.833333, places=5)

    def test_meridian_indices_advance_westward(self) -> None:
        lon, _ = self.anchor.coordinate(LatticeIndex(2, 0))

        self.assertAlmostEqual(lon, -60.833333, places=5)

    def test_parallel_indices_advance_southward(self) -> None:
        _, lat = self.anchor.coordinate(LatticeIndex(0, 5))

        self.assertAlmostEqual(lat, 46.416667, places=5)

    def test_the_verified_printed_label_lands_on_its_lattice_line(self) -> None:
        """60d50'W was read off the scan and must be meridian index 2."""
        lon, _ = self.anchor.coordinate(LatticeIndex(2, 0))

        self.assertAlmostEqual(lon, -(60.0 + 50.0 / 60.0), places=6)

    def test_47_degrees_north_is_two_steps_north_of_the_anchor_parallel(self) -> None:
        _, lat = self.anchor.coordinate(LatticeIndex(0, -2))

        self.assertAlmostEqual(lat, 47.0, places=6)

    def test_rejects_a_non_positive_step(self) -> None:
        with self.assertRaisesRegex(ValueError, "step_minutes"):
            GraticuleAnchor(0, -61.0, 0, 46.0, 0.0)


class GraticuleMeshTests(unittest.TestCase):
    def setUp(self) -> None:
        self.anchor = GraticuleAnchor(0, -60.0 - 40.0 / 60.0, 0, 46.0 + 50.0 / 60.0, 5.0)

    def test_builds_one_control_point_per_intersection(self) -> None:
        mesh = GraticuleMesh(
            self.anchor,
            {
                LatticeIndex(0, 0): (12882.0, 10042.0),
                LatticeIndex(1, 0): (10537.0, 10213.0),
            },
        )

        points = mesh.control_points()

        self.assertEqual(len(points), 2)
        self.assertEqual({p.role for p in points}, {"control"})

    def test_control_point_carries_pixel_and_world_position(self) -> None:
        mesh = GraticuleMesh(self.anchor, {LatticeIndex(2, 0): (8349.0, 10373.0)})

        point = mesh.control_points()[0]

        self.assertEqual(point.pixel_x, 8349.0)
        self.assertEqual(point.pixel_y, 10373.0)
        self.assertAlmostEqual(point.lon, -60.833333, places=5)
        self.assertAlmostEqual(point.lat, 46.833333, places=5)

    def test_label_names_the_printed_degrees_and_minutes(self) -> None:
        mesh = GraticuleMesh(self.anchor, {LatticeIndex(2, 5): (9465.0, 27409.0)})

        self.assertEqual(
            mesh.control_points()[0].label,
            "graticule 60d50mW 46d25mN",
        )

    def test_points_are_emitted_in_a_stable_order(self) -> None:
        mesh = GraticuleMesh(
            self.anchor,
            {
                LatticeIndex(1, 1): (1.0, 1.0),
                LatticeIndex(0, 1): (2.0, 2.0),
                LatticeIndex(1, 0): (3.0, 3.0),
                LatticeIndex(0, 0): (4.0, 4.0),
            },
        )

        order = [(p.pixel_x, p.pixel_y) for p in mesh.control_points()]

        self.assertEqual(order, [(4.0, 4.0), (2.0, 2.0), (3.0, 3.0), (1.0, 1.0)])


if __name__ == "__main__":
    unittest.main()
