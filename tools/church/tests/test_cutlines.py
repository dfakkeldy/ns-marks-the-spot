import unittest

from tools.church.cutlines import Cutline
from tools.church.panels import SourceWindow


class CutlineBoundingWindowTests(unittest.TestCase):
    def test_bounding_window_encloses_every_vertex(self) -> None:
        cutline = Cutline(((10.0, 20.0), (110.0, 5.0), (90.0, 220.0), (0.0, 200.0)))

        window = cutline.bounding_window

        self.assertEqual(window, SourceWindow(x=0, y=5, width=110, height=215))

    def test_bounding_window_rounds_outward_so_no_ink_is_lost(self) -> None:
        cutline = Cutline(((10.7, 20.2), (100.3, 20.2), (100.3, 60.9), (10.7, 60.9)))

        window = cutline.bounding_window

        self.assertEqual(window.x, 10)
        self.assertEqual(window.y, 20)
        self.assertEqual(window.x_end, 101)
        self.assertEqual(window.y_end, 61)


class CutlineContainmentTests(unittest.TestCase):
    """A diagonal edge is the whole point: rectangles cannot separate these panels."""

    def setUp(self) -> None:
        # Right triangle with the hypotenuse running top-right to bottom-left,
        # mirroring the Inverness sheet's diagonal panel divider.
        self.cutline = Cutline(((0.0, 0.0), (100.0, 0.0), (0.0, 100.0)))

    def test_point_well_inside_the_diagonal_is_contained(self) -> None:
        self.assertTrue(self.cutline.contains(10.0, 10.0))

    def test_point_beyond_the_diagonal_is_not_contained(self) -> None:
        # Inside the bounding box, but on the far side of the hypotenuse.
        self.assertTrue(self.cutline.bounding_window.contains(80.0, 80.0))
        self.assertFalse(self.cutline.contains(80.0, 80.0))

    def test_point_outside_the_bounding_box_is_not_contained(self) -> None:
        self.assertFalse(self.cutline.contains(150.0, 10.0))


class CutlineLocalCoordinateTests(unittest.TestCase):
    def test_to_local_shifts_every_vertex_into_crop_space(self) -> None:
        cutline = Cutline(((100.0, 200.0), (300.0, 200.0), (300.0, 500.0)))

        local = cutline.to_local(SourceWindow(x=100, y=200, width=200, height=300))

        self.assertEqual(local.vertices, ((0.0, 0.0), (200.0, 0.0), (200.0, 300.0)))


class CutlineOverlapTests(unittest.TestCase):
    """The rejected 2026-07-24 pilot used overlapping rectangles. Never again."""

    def test_disjoint_cutlines_do_not_overlap(self) -> None:
        left = Cutline(((0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)))
        right = Cutline(((200.0, 0.0), (300.0, 0.0), (300.0, 100.0), (200.0, 100.0)))

        self.assertFalse(left.overlaps(right))

    def test_cutlines_sharing_interior_area_overlap(self) -> None:
        left = Cutline(((0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)))
        right = Cutline(((50.0, 0.0), (150.0, 0.0), (150.0, 100.0), (50.0, 100.0)))

        self.assertTrue(left.overlaps(right))

    def test_diagonally_split_cutlines_sharing_only_an_edge_do_not_overlap(self) -> None:
        # The real Inverness case: two polygons meeting exactly along the divider.
        west = Cutline(((0.0, 0.0), (100.0, 0.0), (0.0, 100.0)))
        east = Cutline(((100.0, 0.0), (100.0, 100.0), (0.0, 100.0)))

        self.assertFalse(west.overlaps(east))


class CutlineAreaTests(unittest.TestCase):
    def test_area_of_a_rectangle_is_width_times_height(self) -> None:
        cutline = Cutline(((0.0, 0.0), (200.0, 0.0), (200.0, 100.0), (0.0, 100.0)))

        self.assertAlmostEqual(cutline.area, 20000.0)

    def test_area_ignores_vertex_winding_direction(self) -> None:
        clockwise = Cutline(((0.0, 0.0), (200.0, 0.0), (200.0, 100.0), (0.0, 100.0)))
        anticlockwise = Cutline(((0.0, 0.0), (0.0, 100.0), (200.0, 100.0), (200.0, 0.0)))

        self.assertAlmostEqual(clockwise.area, anticlockwise.area)

    def test_a_diagonal_cutline_covers_less_than_its_bounding_window(self) -> None:
        triangle = Cutline(((0.0, 0.0), (100.0, 0.0), (0.0, 100.0)))

        window = triangle.bounding_window
        self.assertAlmostEqual(triangle.area, 5000.0)
        self.assertEqual(window.width * window.height, 10000)


class CutlineValidationTests(unittest.TestCase):
    def test_rejects_a_polygon_with_fewer_than_three_vertices(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least 3"):
            Cutline(((0.0, 0.0), (10.0, 10.0)))

    def test_rejects_negative_pixel_coordinates(self) -> None:
        with self.assertRaisesRegex(ValueError, "non-negative"):
            Cutline(((0.0, 0.0), (10.0, -1.0), (10.0, 10.0)))


if __name__ == "__main__":
    unittest.main()
