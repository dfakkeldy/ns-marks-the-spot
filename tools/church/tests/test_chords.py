import unittest

from tools.church.chords import (
    ChordFeature,
    Plane,
    chord_extreme,
    cyclic_runs,
    geographic_plane,
    path_extreme,
    perpendicular_metres,
    runs_in_box,
)
from tools.church.landmarks import BoundingBox

# A degree of longitude at 46 N is about 0.695 of a degree of latitude, so a
# metric comparison has to scale it. These fixtures work in degrees and check
# the metres that come back.
BOX = BoundingBox(west=-61.0, south=46.0, east=-60.9, north=46.1)


class RunsInBoxTests(unittest.TestCase):
    def test_returns_the_contiguous_stretch_inside_the_box(self):
        ring = [
            (-61.5, 46.05),   # outside, west
            (-60.98, 46.02),
            (-60.95, 46.05),
            (-60.92, 46.08),
            (-60.5, 46.05),   # outside, east
        ]
        runs = runs_in_box(ring, BOX)
        self.assertEqual(len(runs), 1)
        self.assertEqual(len(runs[0]), 3)

    def test_a_ring_entering_twice_gives_two_runs(self):
        # Two runs means the box spans two separate stretches of coast, and no
        # single chord describes it. The caller must refuse rather than pick.
        # Both inside vertices need an outside neighbour on each side, or the
        # ring's wraparound joins them into one run.
        ring = [
            (-60.95, 46.05),  # inside
            (-60.5, 46.05),   # leaves
            (-60.94, 46.06),  # inside again
            (-60.4, 46.07),   # leaves, and wraps round to the first
        ]
        self.assertEqual(len(runs_in_box(ring, BOX)), 2)

    def test_wraps_around_the_ring_seam(self):
        # A closed ring has no first vertex; a run crossing index 0 is one run.
        ring = [
            (-60.95, 46.05),
            (-60.5, 46.05),   # outside
            (-60.4, 46.05),   # outside
            (-60.94, 46.06),
        ]
        runs = runs_in_box(ring, BOX)
        self.assertEqual(len(runs), 1)
        self.assertEqual(len(runs[0]), 2)

    def test_no_vertices_inside_gives_no_runs(self):
        self.assertEqual(runs_in_box([(-60.0, 45.0), (-59.0, 45.0)], BOX), [])


class PerpendicularMetresTests(unittest.TestCase):
    def test_a_point_on_the_chord_has_no_deviation(self):
        d = perpendicular_metres((-60.95, 46.05), (-61.0, 46.0), (-60.9, 46.1))
        self.assertAlmostEqual(d, 0.0, places=6)

    def test_deviation_is_returned_in_ground_metres(self):
        # 0.01 degree of latitude off an east-west chord is ~1,106 m.
        d = perpendicular_metres((-60.95, 46.01), (-61.0, 46.0), (-60.9, 46.0))
        self.assertAlmostEqual(abs(d), 1105.7, delta=2.0)

    def test_longitude_is_compressed_by_the_latitude(self):
        # 0.01 degree of longitude at 46 N is ~773 m, not ~1,106 m. Getting this
        # wrong would rank an east-west headland 43 % more prominent than an
        # identical north-south one.
        d = perpendicular_metres((-60.99, 46.05), (-61.0, 46.0), (-61.0, 46.1))
        self.assertAlmostEqual(abs(d), 773.3, delta=3.0)

    def test_sign_flips_with_the_side_of_the_chord(self):
        left = perpendicular_metres((-60.95, 46.01), (-61.0, 46.0), (-60.9, 46.0))
        right = perpendicular_metres((-60.95, 45.99), (-61.0, 46.0), (-60.9, 46.0))
        self.assertLess(left * right, 0.0)

    def test_a_degenerate_chord_is_refused(self):
        with self.assertRaises(ValueError):
            perpendicular_metres((-60.95, 46.05), (-61.0, 46.0), (-61.0, 46.0))


class ChordExtremeTests(unittest.TestCase):
    """The rule itself. Its whole purpose is surviving a trending coast."""

    def straight_trending_coast(self):
        # Runs steadily north-east, exactly the shape that defeats an extremal
        # rule: every vertex is the westernmost one so far.
        return [(-61.0 + 0.002 * i, 46.0 + 0.002 * i) for i in range(51)]

    def test_a_trending_coast_with_no_feature_is_refused(self):
        # The point of the rule: on a plain trend nothing protrudes, and it must
        # say so instead of returning whichever end the box cut.
        box = BoundingBox(west=-61.0, south=46.0, east=-60.9, north=46.1)
        with self.assertRaises(ValueError) as raised:
            chord_extreme(self.straight_trending_coast(), box, min_prominence_m=200.0)
        self.assertIn("prominence", str(raised.exception))

    def test_finds_a_headland_on_a_trending_coast(self):
        # Same trend, with one vertex pushed 0.01 degrees off it. An extremal
        # rule cannot see this; the chord rule must.
        coast = self.straight_trending_coast()
        coast[25] = (coast[25][0] - 0.012, coast[25][1])
        box = BoundingBox(west=-61.05, south=46.0, east=-60.9, north=46.1)
        feature = chord_extreme(coast, box, min_prominence_m=200.0)
        self.assertIsInstance(feature, ChordFeature)
        self.assertAlmostEqual(feature.lat, 46.05, places=3)
        self.assertGreater(abs(feature.prominence_m), 500.0)

    def test_prominence_floor_rejects_a_feature_smaller_than_the_error(self):
        # A check feature less prominent than the error being measured cannot be
        # identified reliably - it pairs with its neighbour and nothing says so.
        coast = self.straight_trending_coast()
        coast[25] = (coast[25][0] - 0.002, coast[25][1])
        box = BoundingBox(west=-61.05, south=46.0, east=-60.9, north=46.1)
        with self.assertRaises(ValueError):
            chord_extreme(coast, box, min_prominence_m=900.0)

    def test_refuses_when_the_extreme_sits_on_the_chord_endpoint(self):
        # Same defect emit_candidates guards for extremal rules: if the answer is
        # at the end of the run, the box clipped the feature rather than
        # selecting it, and the coordinate moves whenever the box does.
        coast = self.straight_trending_coast()
        coast[0] = (coast[0][0] - 0.02, coast[0][1])
        box = BoundingBox(west=-61.05, south=46.0, east=-60.9, north=46.1)
        with self.assertRaises(ValueError) as raised:
            chord_extreme(coast, box, min_prominence_m=200.0)
        self.assertIn("end", str(raised.exception).lower())

    def test_refuses_a_box_holding_two_separate_stretches(self):
        ring = [(-60.95, 46.05), (-60.4, 46.05), (-60.94, 46.06), (-60.3, 46.07)]
        box = BoundingBox(west=-61.0, south=46.0, east=-60.9, north=46.1)
        with self.assertRaises(ValueError) as raised:
            chord_extreme(ring, box, min_prominence_m=10.0)
        self.assertIn("stretch", str(raised.exception).lower())

    def test_is_immune_to_the_trend_slope(self):
        # The real invariance claim: the SAME physical headland, on coasts
        # trending at wildly different angles, must be found in the same place
        # and measured at the same size. An extremal rule cannot do this at all -
        # its answer slides to whichever end of the box the trend runs toward.
        #
        # The bump has to be pushed perpendicular to the local trend by a fixed
        # number of METRES, or it is not the same feature: a fixed longitude
        # offset shrinks to 131 m of perpendicular displacement by slope 0.02,
        # and the rule is right to refuse it there.
        import math

        for slope in (0.0005, 0.002, 0.006, 0.02):
            lon_m = 111320.0 * math.cos(math.radians(46.05))
            tx, ty = slope * lon_m, 0.002 * 110574.0
            length = math.hypot(tx, ty)
            # 800 m perpendicular to the coast, expressed back in degrees.
            push_lon = (-ty / length) * 800.0 / lon_m
            push_lat = (tx / length) * 800.0 / 110574.0
            coast = [(-61.0 + slope * i, 46.0 + 0.002 * i) for i in range(51)]
            coast[25] = (coast[25][0] + push_lon, coast[25][1] + push_lat)
            box = BoundingBox(west=-62.0, south=45.5, east=-60.0, north=46.5)
            feature = chord_extreme(coast, box, 200.0)
            self.assertAlmostEqual(abs(feature.prominence_m), 800.0, delta=25.0,
                                   msg=f"slope {slope}")

    def test_reports_the_runner_up_so_ambiguity_is_visible(self):
        coast = self.straight_trending_coast()
        coast[25] = (coast[25][0] - 0.012, coast[25][1])
        coast[40] = (coast[40][0] - 0.011, coast[40][1])
        box = BoundingBox(west=-61.05, south=46.0, east=-60.9, north=46.1)
        feature = chord_extreme(coast, box, min_prominence_m=200.0)
        self.assertIsNotNone(feature.runner_up_m)
        self.assertGreater(abs(feature.runner_up_m), 500.0)


class CyclicRunsTests(unittest.TestCase):
    """The wraparound logic, shared by the box clip and the tile-edge split."""

    def test_a_run_crossing_the_seam_is_one_run(self):
        runs = cyclic_runs(["a", "b", "c", "d"], [True, False, False, True])
        self.assertEqual(runs, [["d", "a"]])

    def test_two_separated_runs_stay_separate(self):
        runs = cyclic_runs(["a", "b", "c", "d"], [True, False, True, False])
        self.assertEqual(sorted(runs), [["a"], ["c"]])

    def test_all_kept_is_one_run_in_the_original_order(self):
        # No gap means no seam to rotate to, so the caller's order must survive.
        self.assertEqual(cyclic_runs([1, 2, 3], [True] * 3), [[1, 2, 3]])

    def test_none_kept_is_no_runs(self):
        self.assertEqual(cyclic_runs([1, 2, 3], [False] * 3), [])

    def test_a_mismatched_mask_is_refused(self):
        with self.assertRaises(ValueError):
            cyclic_runs([1, 2, 3], [True, False])


class PlaneTests(unittest.TestCase):
    def test_the_geographic_plane_compresses_longitude(self):
        plane = geographic_plane(46.05)
        self.assertAlmostEqual(plane.y_metres, 110574.0, places=3)
        self.assertAlmostEqual(plane.x_metres, 77330.0, delta=100.0)

    def test_a_degenerate_plane_is_refused(self):
        # A zero scale would silently collapse one axis and report every feature
        # as lying exactly on its chord.
        with self.assertRaises(ValueError):
            Plane(x_metres=0.0, y_metres=1.0)


class PathExtremeTests(unittest.TestCase):
    """The same rule on an open path in an arbitrary metric plane.

    This is what lets the engraving be measured: the drawn coast arrives as
    pixels, not degrees, and must be judged by the rule the modern coast is
    judged by rather than by a second rule that happens to agree.
    """

    PIXELS = Plane(x_metres=2.718, y_metres=2.718)

    def straight_path(self, count=51):
        """A path trending diagonally down the page, in pixel coordinates."""
        return [(100.0 + 3.0 * i, 200.0 + 3.0 * i) for i in range(count)]

    def test_measures_a_pixel_bump_in_ground_metres(self):
        # 100 px pushed perpendicular to a 45-degree trend is 100 px of
        # deviation, which at 2.718 m/px is 271.8 m of ground.
        path = self.straight_path()
        offset = 100.0 / 2.0**0.5
        path[25] = (path[25][0] - offset, path[25][1] + offset)
        feature = path_extreme(path, min_prominence_m=100.0, plane=self.PIXELS)
        self.assertAlmostEqual(abs(feature.prominence_m), 271.8, delta=2.0)

    def test_reports_the_winning_vertex_in_the_callers_own_coordinates(self):
        # Pixels in, pixels out. Converting to degrees inside the rule would put
        # the transform under test into the measurement of its own error.
        path = self.straight_path()
        offset = 100.0 / 2.0**0.5
        path[25] = (path[25][0] - offset, path[25][1] + offset)
        feature = path_extreme(path, min_prominence_m=100.0, plane=self.PIXELS)
        self.assertAlmostEqual(feature.x, path[25][0], places=6)
        self.assertAlmostEqual(feature.y, path[25][1], places=6)

    def test_a_flat_path_is_refused(self):
        with self.assertRaises(ValueError) as raised:
            path_extreme(self.straight_path(), min_prominence_m=100.0, plane=self.PIXELS)
        self.assertIn("prominence", str(raised.exception))

    def test_a_path_too_short_to_carry_a_chord_is_refused(self):
        with self.assertRaises(ValueError) as raised:
            path_extreme(self.straight_path(3), min_prominence_m=1.0, plane=self.PIXELS)
        self.assertIn("too short", str(raised.exception))

    def test_a_winner_against_the_end_is_refused(self):
        # A perfectly good interior feature is NOT enough to accept the path: a
        # bigger one straddling the end means the crop cut through a headland,
        # and its apex - wherever the rule then lands - moves with the crop.
        # Both ends stay put so the chord is the original line and each push is
        # exactly the deviation it produces.
        path = self.straight_path()
        push = 1.0 / 2.0**0.5
        path[1] = (path[1][0] - 200.0 * push, path[1][1] + 200.0 * push)
        path[25] = (path[25][0] - 50.0 * push, path[25][1] + 50.0 * push)
        with self.assertRaises(ValueError) as raised:
            path_extreme(path, min_prominence_m=100.0, plane=self.PIXELS)
        self.assertIn("end", str(raised.exception).lower())

    def test_an_anisotropic_plane_scales_each_axis_separately(self):
        # The geographic plane is anisotropic, so the shared core has to be. A
        # 100-unit push along x under a 10 m/unit x-scale is 1,000 m.
        plane = Plane(x_metres=10.0, y_metres=1.0)
        path = [(0.0, float(i)) for i in range(21)]
        path[10] = (100.0, path[10][1])
        feature = path_extreme(path, min_prominence_m=1.0, plane=plane)
        self.assertAlmostEqual(abs(feature.prominence_m), 1000.0, delta=1.0)


if __name__ == "__main__":
    unittest.main()
