import unittest

from tools.church.chords import (
    ChordFeature,
    chord_extreme,
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


if __name__ == "__main__":
    unittest.main()
