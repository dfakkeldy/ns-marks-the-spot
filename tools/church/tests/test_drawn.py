import unittest

from tools.church.drawn import (
    AREA_RATIO_MAX,
    AREA_RATIO_MIN,
    MIN_FILL_RATIO,
    SOURCE_METRES_PER_PIXEL,
    InkMask,
    dilated,
    format_check_rows,
    ink_mask,
    refuse_duplicate_matches,
    orientation_gap,
    polygon_moments,
    select_shape,
    shape_signature,
    shapes_in,
    square_degrees_to_pixel_area,
    tile_origin,
    trace_outer_boundary,
)


def mask_of(art: list[str], ink_char: str = "#") -> InkMask:
    """Build a mask from ASCII art, so tests read as pictures."""
    pixels = {
        (x, y)
        for y, line in enumerate(art)
        for x, char in enumerate(line)
        if char == ink_char
    }
    return InkMask(width=max(len(line) for line in art), height=len(art), pixels=pixels)


class InkMaskTests(unittest.TestCase):
    def test_thresholds_on_darkness(self):
        rows = [[255, 10], [200, 250]]
        mask = ink_mask(rows, darkness=128)
        self.assertEqual(mask.pixels, {(1, 0)})
        self.assertEqual((mask.width, mask.height), (2, 2))

    def test_threshold_is_exclusive_so_it_matches_the_detector(self):
        # detect_graticule treats `darkness` as "darker than", not "at most".
        rows = [[128, 127]]
        self.assertEqual(ink_mask(rows, darkness=128).pixels, {(1, 0)})

    def test_border_pixels_are_recognised(self):
        mask = mask_of(["#..", "...", "..."])
        self.assertTrue(mask.on_border(0, 0))
        self.assertFalse(mask.on_border(1, 1))


class TraceOuterBoundaryTests(unittest.TestCase):
    def test_a_filled_square_traces_its_own_edge(self):
        pixels = {(x, y) for x in range(3) for y in range(3)}
        ring = trace_outer_boundary(pixels)
        # The eight edge pixels, and never the enclosed centre.
        self.assertNotIn((1, 1), ring)
        self.assertEqual(set(ring), pixels - {(1, 1)})

    def test_a_hollow_ring_traces_the_outside_not_the_hole(self):
        # A drawn island is an OUTLINE, so the boundary that matters is the one
        # around the outside of the stroke - it encloses the whole island.
        outline = {
            (x, y)
            for x in range(5)
            for y in range(5)
            if x in (0, 4) or y in (0, 4)
        }
        ring = trace_outer_boundary(outline)
        self.assertEqual(set(ring), outline)

    def test_a_single_pixel_is_its_own_ring(self):
        self.assertEqual(trace_outer_boundary({(4, 7)}), [(4, 7)])

    def test_traversal_is_connected_step_by_step(self):
        pixels = {(x, 0) for x in range(4)} | {(3, y) for y in range(4)}
        ring = trace_outer_boundary(pixels)
        for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
            self.assertLessEqual(max(abs(x1 - x0), abs(y1 - y0)), 1)


class ShapesInTests(unittest.TestCase):
    def test_finds_each_separate_outline(self):
        mask = mask_of(
            [
                "###....###",
                "#.#....#.#",
                "###....###",
                "..........",
            ]
        )
        shapes = shapes_in(mask, min_ink=4)
        self.assertEqual(len(shapes), 2)
        self.assertEqual(
            sorted(round(shape.centroid_x, 3) for shape in shapes), [1.0, 8.0]
        )

    def test_centroid_of_a_symmetric_outline_is_its_centre(self):
        mask = mask_of(
            [
                ".....",
                ".###.",
                ".#.#.",
                ".###.",
                ".....",
            ]
        )
        shape = shapes_in(mask, min_ink=4)[0]
        self.assertAlmostEqual(shape.centroid_x, 2.0, places=6)
        self.assertAlmostEqual(shape.centroid_y, 2.0, places=6)

    def test_a_straight_line_encloses_no_area_and_is_dropped(self):
        # A coastline crossing the tile is ink, but it is not an island. Its
        # outer boundary doubles back on itself and cancels to zero.
        mask = mask_of(["........", "########", "........"])
        self.assertEqual(shapes_in(mask, min_ink=4), [])

    def test_flags_a_shape_that_runs_off_the_tile(self):
        # Same guard emit_candidates applies to boxes: a shape touching the edge
        # is CLIPPED by the tile, so its centroid is an artifact of the crop.
        mask = mask_of(
            [
                "###..",
                "#.#..",
                "###..",
            ]
        )
        shape = shapes_in(mask, min_ink=4)[0]
        self.assertTrue(shape.touches_border)

    def test_ignores_specks_below_the_ink_floor(self):
        mask = mask_of(
            [
                ".........",
                ".###...#.",
                ".#.#.....",
                ".###.....",
                ".........",
            ]
        )
        shapes = shapes_in(mask, min_ink=4)
        self.assertEqual(len(shapes), 1)


def hollow(x0: int, y0: int, width: int, height: int) -> set:
    """A rectangular OUTLINE - what an island actually is on the engraving."""
    return {
        (x, y)
        for x in range(x0, x0 + width)
        for y in range(y0, y0 + height)
        if x in (x0, x0 + width - 1) or y in (y0, y0 + height - 1)
    }


class SelectShapeTests(unittest.TestCase):
    """The selection policy, which is where circularity would creep in."""

    def setUp(self):
        # Two island outlines, both well clear of the tile edge. The BIG one
        # sits ON the prediction; the right-sized one is further away. Shape
        # must decide, or the measurement just reproduces the transform it is
        # meant to test.
        self.mask = InkMask(
            width=200,
            height=200,
            pixels=hollow(10, 10, 61, 61) | hollow(100, 20, 21, 21),
        )

    def test_area_decides_not_proximity(self):
        chosen = select_shape(
            shapes_in(self.mask, min_ink=4),
            expected_area_px=400.0,
            prediction=(40.0, 40.0),
            radius_px=200.0,
        )
        self.assertIsNotNone(chosen.shape)
        self.assertAlmostEqual(chosen.shape.centroid_x, 110.0, places=6)

    def test_reports_the_runner_up_so_the_margin_is_auditable(self):
        chosen = select_shape(
            shapes_in(self.mask, min_ink=4),
            expected_area_px=400.0,
            prediction=(40.0, 40.0),
            radius_px=200.0,
        )
        self.assertEqual(chosen.considered, 2)
        self.assertIsNotNone(chosen.runner_up_area_ratio)

    def test_refuses_when_two_shapes_both_fit_the_size(self):
        mask = InkMask(
            width=200, height=200, pixels=hollow(10, 20, 21, 21) | hollow(100, 20, 21, 21)
        )
        chosen = select_shape(
            shapes_in(mask, min_ink=4),
            expected_area_px=400.0,
            prediction=(60.0, 30.0),
            radius_px=200.0,
        )
        self.assertIsNone(chosen.shape)
        self.assertIn("ambiguous", chosen.reason)

    def test_refuses_when_nothing_matches_the_size(self):
        chosen = select_shape(
            shapes_in(self.mask, min_ink=4),
            expected_area_px=5.0,
            prediction=(40.0, 40.0),
            radius_px=200.0,
        )
        self.assertIsNone(chosen.shape)
        self.assertIn("no shape", chosen.reason)

    def test_refuses_a_shape_that_is_clipped_by_the_tile(self):
        mask = InkMask(width=30, height=30, pixels=hollow(0, 0, 21, 21))
        chosen = select_shape(
            shapes_in(mask, min_ink=4),
            expected_area_px=400.0,
            prediction=(10.0, 10.0),
            radius_px=100.0,
        )
        self.assertIsNone(chosen.shape)
        self.assertIn("clipped", chosen.reason)

    def test_search_radius_cannot_invent_a_match(self):
        # The radius is a coarse window, not a vote. Shrinking it to nothing
        # must lose the point, never move it.
        chosen = select_shape(
            shapes_in(self.mask, min_ink=4),
            expected_area_px=400.0,
            prediction=(40.0, 40.0),
            radius_px=1.0,
        )
        self.assertIsNone(chosen.shape)

    def test_refuses_lettering_that_happens_to_enclose_the_right_area(self):
        # The real failure this guard was written for: the detector accepted the
        # word "Cove" out of "Clarke Cove" as an island. A word is mostly ink.
        solid = {(x, y) for x in range(50, 71) for y in range(50, 71)}
        mask = InkMask(width=200, height=200, pixels=solid)
        chosen = select_shape(
            shapes_in(mask, min_ink=4),
            expected_area_px=400.0,
            prediction=(60.0, 60.0),
            radius_px=100.0,
        )
        self.assertIsNone(chosen.shape)
        self.assertIn("more ink than enclosure", chosen.reason)

    def test_the_area_band_brackets_the_matches_confirmed_by_eye(self):
        # Correct matches measured 0.96-1.35 on the QA sheet; the misidentified
        # ones - lettering, a neighbouring island - measured 0.32-0.54. The band
        # has to admit the first group and exclude the second.
        for good in (0.96, 1.07, 1.23, 1.35):
            self.assertTrue(AREA_RATIO_MIN <= good <= AREA_RATIO_MAX, good)
        for wrong in (0.32, 0.35, 0.40, 0.54):
            self.assertFalse(AREA_RATIO_MIN <= wrong <= AREA_RATIO_MAX, wrong)

    def test_a_solid_blob_of_lettering_never_reaches_the_area_test(self):
        self.assertLess(0.98, MIN_FILL_RATIO)
        self.assertGreater(3.69, MIN_FILL_RATIO)


class ShapeSignatureTests(unittest.TestCase):
    def test_a_four_to_one_rectangle_reads_as_four_to_one(self):
        ring = [(-40.0, -10.0), (40.0, -10.0), (40.0, 10.0), (-40.0, 10.0)]
        elongation, orientation = shape_signature(ring)
        self.assertAlmostEqual(elongation, 4.0, places=6)
        self.assertAlmostEqual(orientation, 0.0, places=6)

    def test_a_rotated_rectangle_reports_its_rotation(self):
        import math

        angle = math.radians(30.0)
        corners = [(-40.0, -10.0), (40.0, -10.0), (40.0, 10.0), (-40.0, 10.0)]
        ring = [
            (x * math.cos(angle) - y * math.sin(angle),
             x * math.sin(angle) + y * math.cos(angle))
            for x, y in corners
        ]
        elongation, orientation = shape_signature(ring)
        self.assertAlmostEqual(elongation, 4.0, places=6)
        self.assertAlmostEqual(orientation, 30.0, places=4)

    def test_a_square_is_not_elongated(self):
        ring = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
        self.assertAlmostEqual(shape_signature(ring)[0], 1.0, places=6)

    def test_scaling_axes_changes_the_aspect_as_a_metric_frame_would(self):
        # The modern ring arrives in degrees, where longitude is compressed.
        ring = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
        self.assertAlmostEqual(shape_signature(ring, x_scale=0.5)[0], 2.0, places=6)

    def test_flipping_y_mirrors_the_orientation(self):
        # The page runs y DOWNWARD, so a drawn ring must be flipped before its
        # angle can be compared with a north-up modern one.
        ring = [(0.0, 0.0), (40.0, 10.0), (39.0, 12.0), (-1.0, 2.0)]
        up = shape_signature(ring, y_scale=1.0)[1]
        down = shape_signature(ring, y_scale=-1.0)[1]
        self.assertAlmostEqual(orientation_gap(up, -down), 0.0, places=6)

    def test_moments_of_a_ring_with_no_area_are_refused(self):
        with self.assertRaises(ValueError):
            polygon_moments([(0.0, 0.0), (5.0, 0.0), (10.0, 0.0)])


class OrientationGapTests(unittest.TestCase):
    def test_an_axis_has_no_head_or_tail(self):
        self.assertAlmostEqual(orientation_gap(10.0, 170.0), 20.0, places=6)

    def test_perpendicular_is_the_furthest_two_axes_can_be(self):
        self.assertAlmostEqual(orientation_gap(0.0, 90.0), 90.0, places=6)

    def test_identical_axes_are_zero_apart(self):
        self.assertAlmostEqual(orientation_gap(45.0, 45.0), 0.0, places=6)


class DilationTests(unittest.TestCase):
    def test_bridges_a_broken_outline_into_one_shape(self):
        # A one-pixel nick does not break an outline - 8-connectivity carries
        # straight across it. It takes a wider break, as a worn or lightly
        # inked stroke gives, to split the island into two arcs that each
        # enclose a sliver and neither of which is the island.
        broken = mask_of(
            [
                ".##..##.",
                ".#....#.",
                ".#....#.",
                ".##..##.",
            ]
        )
        self.assertEqual(len(shapes_in(broken, min_ink=4)), 2)

        closed = shapes_in(dilated(broken, 1), min_ink=4)
        self.assertEqual(len(closed), 1)
        self.assertAlmostEqual(closed[0].centroid_x, 3.5, places=6)
        self.assertAlmostEqual(closed[0].centroid_y, 1.5, places=6)

    def test_growth_does_not_move_a_symmetric_centroid(self):
        mask = mask_of(
            [
                ".......",
                ".#####.",
                ".#...#.",
                ".#####.",
                ".......",
            ]
        )
        before = shapes_in(mask, min_ink=4)[0]
        after = shapes_in(dilated(mask, 1), min_ink=4)[0]
        self.assertAlmostEqual(before.centroid_x, after.centroid_x, places=6)
        self.assertAlmostEqual(before.centroid_y, after.centroid_y, places=6)

    def test_zero_radius_is_a_no_op(self):
        mask = mask_of([".#.", "###", ".#."])
        self.assertEqual(dilated(mask, 0).pixels, mask.pixels)

    def test_separable_growth_equals_a_square_structuring_element(self):
        # The fast path dilates x then y. If that ever stopped matching the
        # honest r-by-r square, every enclosed area would shift and the size
        # filter would drift with it.
        mask = mask_of(
            [
                "..#....#..",
                ".###......",
                "..#...##..",
                "......##..",
                "#.........",
            ]
        )
        for radius in (1, 2, 3):
            naive = {
                (x + dx, y + dy)
                for x, y in mask.pixels
                for dx in range(-radius, radius + 1)
                for dy in range(-radius, radius + 1)
                if 0 <= x + dx < mask.width and 0 <= y + dy < mask.height
            }
            self.assertEqual(dilated(mask, radius).pixels, naive, f"radius {radius}")

    def test_growth_stays_inside_the_tile(self):
        mask = mask_of(["#.", ".."])
        grown = dilated(mask, 1)
        self.assertTrue(all(0 <= x < 2 and 0 <= y < 2 for x, y in grown.pixels))


class PixelAreaTests(unittest.TestCase):
    def test_collapses_longitude_anisotropy(self):
        # A degree of longitude at 46 N is about cos(46) of a degree of latitude,
        # so a square degree is NOT metres_per_degree squared.
        area = square_degrees_to_pixel_area(1.0, 46.0, metres_per_pixel=1.0)
        self.assertAlmostEqual(area / 1e9, 8.551, places=2)

    def test_scales_inversely_with_pixel_size(self):
        fine = square_degrees_to_pixel_area(1e-6, 46.0, metres_per_pixel=1.0)
        coarse = square_degrees_to_pixel_area(1e-6, 46.0, metres_per_pixel=2.0)
        self.assertAlmostEqual(fine / coarse, 4.0, places=6)

    def test_a_realistic_small_island_lands_in_a_readable_pixel_range(self):
        # island-45-814n-61-013w is roughly 0.1 km2; at 2.718 m/px that has to
        # be big enough to see and small enough not to be a headland.
        pixels = square_degrees_to_pixel_area(1.2e-5, 45.81)
        self.assertGreater(pixels, 1_000)
        self.assertLess(pixels, 500_000)

    def test_the_two_lattices_agree_on_the_pixel_size(self):
        # 2.7126 from the north 5' lattice, 2.7178 from the south 10' one. They
        # agree to 5 mm per pixel, which is 0.2 % - the constant is a rounding
        # of two independent measurements, not either one of them, and nothing
        # here is sensitive at that level.
        north = 1852.0 / (3413.7 / 5.0)
        south = 1852.0 / (6814.4 / 10.0)
        self.assertAlmostEqual(north, SOURCE_METRES_PER_PIXEL, delta=0.01)
        self.assertAlmostEqual(south, SOURCE_METRES_PER_PIXEL, delta=0.01)
        self.assertAlmostEqual(north, south, delta=0.01)


class RefuseDuplicateMatchesTests(unittest.TestCase):
    def point(self, label, x, y, accepted=True):
        return {"label": label, "accepted": accepted, "pixel_x": x, "pixel_y": y}

    def test_two_candidates_on_one_drawing_are_both_refused(self):
        # Keeping the nearer one would let the prediction pick the answer, which
        # is the one thing this whole measurement is built to prevent.
        out = refuse_duplicate_matches(
            [self.point("a", 27161.0, 27226.7), self.point("b", 27161.0, 27226.7)]
        )
        self.assertFalse(any(r["accepted"] for r in out))
        self.assertIn("b", out[0]["reason"])
        self.assertIn("a", out[1]["reason"])

    def test_distinct_islands_are_left_alone(self):
        out = refuse_duplicate_matches(
            [self.point("a", 100.0, 100.0), self.point("b", 900.0, 900.0)]
        )
        self.assertTrue(all(r["accepted"] for r in out))

    def test_near_misses_inside_the_tolerance_still_count_as_one_drawing(self):
        out = refuse_duplicate_matches(
            [self.point("a", 100.0, 100.0), self.point("b", 103.0, 104.0)]
        )
        self.assertFalse(any(r["accepted"] for r in out))

    def test_an_already_refused_candidate_is_passed_through_untouched(self):
        refused = {"label": "c", "accepted": False, "reason": "no shape"}
        out = refuse_duplicate_matches([refused, self.point("a", 100.0, 100.0)])
        self.assertEqual(out[0]["reason"], "no shape")
        self.assertTrue(out[1]["accepted"])

    def test_three_on_one_drawing_all_go(self):
        out = refuse_duplicate_matches(
            [self.point(n, 500.0, 500.0) for n in ("a", "b", "c")]
        )
        self.assertFalse(any(r["accepted"] for r in out))


class TileOriginTests(unittest.TestCase):
    def test_centres_the_tile_on_the_prediction(self):
        self.assertEqual(tile_origin(5000.0, 1400, 30000), 4300)

    def test_clamps_at_the_left_edge_rather_than_going_negative(self):
        # A negative offset returns a blank tile, which reads as "nothing was
        # drawn here" when the truth is "nothing was read here".
        self.assertEqual(tile_origin(100.0, 1400, 30000), 0)

    def test_clamps_at_the_right_edge(self):
        self.assertEqual(tile_origin(29900.0, 1400, 30000), 28600)


class FormatCheckRowsTests(unittest.TestCase):
    def setUp(self):
        self.accepted = {
            "accepted": True,
            "label": "island-45-814n-61-013w",
            "lon": -61.013475,
            "lat": 45.813973,
            "pixel_x": 29426.37,
            "pixel_y": 24640.82,
        }

    def test_writes_one_row_per_accepted_point(self):
        text = format_check_rows([self.accepted], header="# hi")
        self.assertEqual(
            text.splitlines()[-1],
            "29426.4,24640.8,-61.013475,45.813973,check,island-45-814n-61-013w",
        )

    def test_every_row_is_role_check(self):
        # parse_check_csv refuses anything else, and that refusal is what keeps
        # a held-out point from silently becoming a control point.
        text = format_check_rows([self.accepted, dict(self.accepted)], header="#")
        for line in text.splitlines()[2:]:
            self.assertEqual(line.split(",")[4], "check")

    def test_a_refused_candidate_contributes_no_row(self):
        refused = {"accepted": False, "label": "whycocomagh-bay-west-end"}
        text = format_check_rows([refused, self.accepted], header="# h")
        self.assertEqual(len(text.strip().splitlines()), 3)
        self.assertNotIn("whycocomagh", text)

    def test_keeps_the_existing_prose_header(self):
        text = format_check_rows([], header="# why this set is small\n# second line")
        self.assertTrue(text.startswith("# why this set is small\n# second line\n"))

    def test_header_is_followed_by_the_column_row(self):
        text = format_check_rows([], header="# h")
        self.assertEqual(text.splitlines()[1], "pixel_x,pixel_y,lon,lat,role,label")


if __name__ == "__main__":
    unittest.main()
