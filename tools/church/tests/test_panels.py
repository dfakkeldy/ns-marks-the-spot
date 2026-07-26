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

    def test_richmond_registers_one_inset_free_measurement_panel(self) -> None:
        panels = panels_for_county("richmond")

        self.assertEqual([panel.slug for panel in panels], ["main"])
        panel = panels[0]
        self.assertEqual(
            panel.window,
            SourceWindow(x=1068, y=8593, width=33544, height=13549),
        )
        self.assertTrue(panel.draws(18000, 16000))
        self.assertFalse(panel.draws(6000, 6000), "1886 reference map")
        self.assertFalse(panel.draws(27000, 4000), "title block")
        self.assertFalse(panel.draws(25000, 25000), "Arichat inset")

    def test_victoria_registers_two_inset_free_geographic_panels(self) -> None:
        northwest, main = panels_for_county("victoria")

        self.assertEqual([northwest.slug, main.slug], ["northwest", "main"])
        self.assertEqual(
            northwest.window,
            SourceWindow(x=900, y=1200, width=11100, height=18800),
        )
        self.assertEqual(
            main.window,
            SourceWindow(x=13800, y=1200, width=19400, height=28800),
        )
        self.assertTrue(northwest.draws(7000, 9000))
        self.assertFalse(northwest.draws(2000, 7000), "New Haven inset")
        self.assertFalse(main.draws(8000, 6000), "title block")
        self.assertTrue(main.draws(24000, 16000))
        self.assertFalse(main.draws(29000, 26000), "Baddeck inset")


class PanelCutlineTests(unittest.TestCase):
    """Guards against every geometric defect that sank the 2026-07-24 pilot."""

    def test_window_is_derived_from_the_cutline(self) -> None:
        for panel in panels_for_county("inverness"):
            self.assertEqual(panel.window, panel.cutline.bounding_window)

    def test_the_two_panels_never_claim_the_same_pixel(self) -> None:
        north = get_panel("inverness", "north")
        south = get_panel("inverness", "south")

        self.assertFalse(north.cutline.overlaps(south.cutline))

    def test_rectangular_windows_would_overlap_but_cutlines_do_not(self) -> None:
        """The bounding boxes still overlap - which is exactly why cutlines exist."""
        north = get_panel("inverness", "north").window
        south = get_panel("inverness", "south").window

        self.assertLess(south.x, north.x_end)
        self.assertLess(north.y, south.y_end)

    def test_each_cutline_excludes_real_material_from_its_bounding_box(self) -> None:
        for panel in panels_for_county("inverness"):
            window = panel.window
            box_area = float(window.width * window.height)
            with self.subTest(panel=panel.slug):
                self.assertLess(panel.cutline.area, 0.9 * box_area)

    def test_cutlines_stay_inside_the_archival_scan(self) -> None:
        for panel in panels_for_county("inverness"):
            for x, y in panel.cutline.vertices:
                with self.subTest(panel=panel.slug, vertex=(x, y)):
                    self.assertGreaterEqual(x, 0)
                    self.assertGreaterEqual(y, 0)
                    self.assertLessEqual(x, 34427)
                    self.assertLessEqual(y, 34543)

    def test_no_cutline_contains_a_town_plan_inset_or_the_title_block(self) -> None:
        """Sample points inside each decoration that must never be warped."""
        decorations = {
            "title block": (4800, 4600),
            "engraved vignette": (18600, 2500),
            "West Bay inset": (32000, 12000),
            "Port Hood inset": (32000, 31000),
            "Port Hawkesbury inset": (4000, 31500),
            "Whycocomagh inset": (10000, 31500),
            "Mabou inset": (14800, 32000),
            "Margaree inset": (24000, 32400),
            "Port Hastings inset": (27800, 32000),
        }
        for panel in panels_for_county("inverness"):
            for name, (x, y) in decorations.items():
                with self.subTest(panel=panel.slug, decoration=name):
                    self.assertFalse(panel.cutline.contains(x, y))


if __name__ == "__main__":
    unittest.main()


class GraticuleSettingsTests(unittest.TestCase):
    def test_north_panel_records_how_its_mesh_was_made(self):
        panel = get_panel("inverness", "north")
        assert panel.graticule is not None and panel.detection is not None
        # The step the two read labels pin, and the minimum line length that
        # actually finds all six parallels. At 600 only four survive.
        self.assertEqual(panel.graticule.anchor.step_minutes, 5.0)
        self.assertEqual(panel.detection.min_length_px, 500)
        self.assertEqual(panel.detection.angles_deg, (84.5, 174.5))

    def test_north_anchor_is_exact_arcminutes_not_a_rounded_decimal(self):
        # The first emission of the control CSV typed 46.833333 instead of
        # 46 degrees 50 minutes, and every coordinate inherited the rounding.
        panel = get_panel("inverness", "north")
        assert panel.graticule is not None
        self.assertAlmostEqual(
            panel.graticule.anchor.parallel_lat, 46.0 + 50.0 / 60.0, places=12
        )
        # Meridian index 0 is the westernmost rule, 61d00'W. The label actually
        # read, 60d40'W, is index 4 - four exact 5-arcminute steps east.
        self.assertAlmostEqual(panel.graticule.anchor.meridian_lon, -61.0, places=12)
        four_steps_east = (
            panel.graticule.anchor.meridian_lon + 4 * panel.graticule.anchor.step_degrees
        )
        self.assertAlmostEqual(four_steps_east, -(60.0 + 40.0 / 60.0), places=12)

    def test_anchor_evidence_is_recorded(self):
        panel = get_panel("inverness", "north")
        assert panel.graticule is not None
        self.assertIn("60d40", panel.graticule.anchor_evidence)

    def test_a_panel_without_a_read_label_has_no_anchor(self):
        # Settings are never inherited from a neighbouring panel: the two
        # Inverness panels sit on different projection centres.
        south = get_panel("inverness", "south")
        north = get_panel("inverness", "north")
        if south.graticule is not None:
            self.assertNotEqual(south.graticule.anchor, north.graticule.anchor)

    def test_south_keeps_engraved_anchor_separate_from_off_sample_correction(self):
        panel = get_panel("inverness", "south")
        assert panel.graticule is not None

        self.assertAlmostEqual(
            panel.graticule.anchor.meridian_lon,
            -(61.0 + 20.0 / 60.0),
            places=12,
        )
        self.assertEqual(panel.graticule.longitude_correction_arcseconds, -17.0)
        self.assertAlmostEqual(
            panel.graticule.control_anchor.meridian_lon,
            panel.graticule.anchor.meridian_lon - 17.0 / 3600.0,
            places=12,
        )
        self.assertIn("Richmond", panel.graticule.correction_evidence)

    def test_richmond_anchor_comes_from_engraved_ten_minute_labels(self):
        panel = get_panel("richmond", "main")
        assert panel.graticule is not None and panel.detection is not None

        self.assertEqual(panel.graticule.anchor.step_minutes, 10.0)
        self.assertAlmostEqual(
            panel.graticule.anchor.meridian_lon,
            -(61.0 + 20.0 / 60.0),
            places=12,
        )
        self.assertAlmostEqual(
            panel.graticule.anchor.parallel_lat,
            45.0 + 40.0 / 60.0,
            places=12,
        )
        self.assertEqual(panel.detection.angles_deg, (90.0, 0.0))
        self.assertIn("60d50", panel.graticule.anchor_evidence)

    def test_richmond_uses_the_enclosed_paper_island_reader(self):
        richmond = get_panel("richmond", "main")
        inverness = get_panel("inverness", "south")

        self.assertIsNotNone(richmond.drawn_checks)
        self.assertEqual(richmond.drawn_checks.reader, "enclosed-paper")
        self.assertEqual(inverness.drawn_checks.reader, "ink-outline")
        self.assertEqual(richmond.drawn_checks.darkness, inverness.drawn_checks.darkness)
        self.assertEqual(richmond.drawn_checks.dilate_px, inverness.drawn_checks.dilate_px)

    def test_victoria_anchors_both_ten_minute_lattices_from_printed_labels(self):
        northwest = get_panel("victoria", "northwest")
        main = get_panel("victoria", "main")
        assert northwest.graticule is not None and main.graticule is not None

        self.assertEqual(northwest.graticule.anchor.step_minutes, 10.0)
        self.assertAlmostEqual(
            northwest.graticule.anchor.meridian_lon,
            -(60.0 + 40.0 / 60.0),
            places=12,
        )
        self.assertAlmostEqual(
            northwest.graticule.anchor.parallel_lat,
            47.0,
            places=12,
        )
        self.assertEqual(main.graticule.anchor.step_minutes, 10.0)
        self.assertAlmostEqual(
            main.graticule.anchor.parallel_lat,
            46.0 + 30.0 / 60.0,
            places=12,
        )
        self.assertIn("60d40", northwest.graticule.anchor_evidence)
        self.assertIn("46d30", main.graticule.anchor_evidence)
        assert northwest.detection is not None and main.detection is not None
        self.assertEqual(northwest.detection.angle_tolerance_deg, 2.0)
        self.assertEqual(main.detection.angle_tolerance_deg, 2.0)


class PanelCoverageTests(unittest.TestCase):
    """Whether a panel draws a given sheet pixel decides whether a candidate
    check feature can be read there at all. Several attempt-3 north candidates
    predicted onto blank paper or a town-plan inset; that is a computable fact
    about the cutline, not something to discover by eye on a contact sheet."""

    def test_a_pixel_in_the_northern_strip_belongs_to_north_alone(self) -> None:
        north = get_panel("inverness", "north")
        south = get_panel("inverness", "south")
        self.assertTrue(north.draws(6000.0, 20000.0))
        self.assertFalse(south.draws(6000.0, 20000.0))

    def test_a_pixel_in_the_southern_body_belongs_to_south_alone(self) -> None:
        north = get_panel("inverness", "north")
        south = get_panel("inverness", "south")
        self.assertTrue(south.draws(26000.0, 20000.0))
        self.assertFalse(north.draws(26000.0, 20000.0))

    def test_neither_panel_draws_an_excluded_inset(self) -> None:
        # The West Bay inset notch, cut out of the south panel's east edge.
        north = get_panel("inverness", "north")
        south = get_panel("inverness", "south")
        self.assertFalse(south.draws(32000.0, 12000.0))
        self.assertFalse(north.draws(32000.0, 12000.0))

    def test_neither_panel_draws_the_title_cartouche(self) -> None:
        north = get_panel("inverness", "north")
        self.assertFalse(north.draws(4000.0, 3000.0))
