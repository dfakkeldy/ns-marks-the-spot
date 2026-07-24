import unittest

from tools.church.gcps import CHECK_ROLE, GroundControlPoint
from tools.church.panels import SourceWindow, get_panel, panels_for_county


class SourceWindowTests(unittest.TestCase):
    def test_shifts_full_sheet_point_to_panel_coordinates(self) -> None:
        window = SourceWindow(x=12500, y=1500, width=21000, height=32000)
        point = GroundControlPoint(
            19358.0,
            10189.0,
            -61.392397,
            46.071979,
            CHECK_ROLE,
            "Mabou",
        )

        shifted = window.to_local_point(point)

        self.assertEqual(shifted.pixel_x, 6858.0)
        self.assertEqual(shifted.pixel_y, 8689.0)
        self.assertEqual(shifted.lon, point.lon)
        self.assertEqual(shifted.lat, point.lat)
        self.assertEqual(shifted.role, CHECK_ROLE)
        self.assertEqual(shifted.label, "Mabou")

    def test_rejects_point_outside_window(self) -> None:
        window = SourceWindow(x=100, y=200, width=300, height=400)
        point = GroundControlPoint(99.0, 250.0, -61.0, 46.0, CHECK_ROLE, "outside")

        with self.assertRaisesRegex(ValueError, "outside"):
            window.to_local_point(point)

    def test_contains_inclusive_origin_and_exclusive_far_edge(self) -> None:
        window = SourceWindow(x=100, y=200, width=300, height=400)

        self.assertTrue(window.contains(100, 200))
        self.assertTrue(window.contains(399.999, 599.999))
        self.assertFalse(window.contains(400, 600))


class PanelRegistryTests(unittest.TestCase):
    def test_inverness_has_two_named_geographic_panels(self) -> None:
        panels = panels_for_county("inverness")

        self.assertEqual([panel.slug for panel in panels], ["north", "south"])
        self.assertEqual(len({panel.window for panel in panels}), 2)

    def test_windows_fit_inside_archival_source(self) -> None:
        for panel in panels_for_county("inverness"):
            self.assertGreaterEqual(panel.window.x, 0)
            self.assertGreaterEqual(panel.window.y, 0)
            self.assertLessEqual(panel.window.x_end, 34427)
            self.assertLessEqual(panel.window.y_end, 34543)
            self.assertLess(panel.target_bounds.west, panel.target_bounds.east)
            self.assertLess(panel.target_bounds.south, panel.target_bounds.north)
            self.assertGreater(panel.target_resolution_m, 0)

    def test_get_panel_rejects_unknown_name(self) -> None:
        with self.assertRaisesRegex(KeyError, "inverness.*bogus"):
            get_panel("inverness", "bogus")


if __name__ == "__main__":
    unittest.main()
