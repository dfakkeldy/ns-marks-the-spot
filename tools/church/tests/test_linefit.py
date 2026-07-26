import math
import unittest

from tools.church.linefit import (
    FittedLine,
    angular_distance,
    canonical_direction,
    dominant_angles,
    fit_line,
    intersect,
    merge_collinear,
    segment_angle_deg,
    split_families,
)


class SegmentAngleTests(unittest.TestCase):
    def test_folds_into_half_turn(self):
        self.assertAlmostEqual(segment_angle_deg((0, 0, 10, 0)), 0.0)
        self.assertAlmostEqual(segment_angle_deg((0, 0, 0, 10)), 90.0)

    def test_reversed_segment_is_the_same_orientation(self):
        # A line has no direction; drawing it backwards must not change it.
        self.assertAlmostEqual(
            segment_angle_deg((0, 0, 10, 5)), segment_angle_deg((10, 5, 0, 0))
        )


class AngularDistanceTests(unittest.TestCase):
    def test_wraps_across_the_half_turn(self):
        # 179 and 1 are 2 apart, not 178: the naive subtraction is the bug this
        # guards, and it would split one graticule family into two.
        self.assertAlmostEqual(angular_distance(179.0, 1.0), 2.0)

    def test_never_exceeds_a_quarter_turn(self):
        for a in range(0, 180, 7):
            for b in range(0, 180, 11):
                self.assertLessEqual(angular_distance(a, b), 90.0 + 1e-9)


class CanonicalDirectionTests(unittest.TestCase):
    def test_orients_horizontal_family_by_x(self):
        self.assertEqual(canonical_direction(-2.0, 1.0), (2.0, -1.0))

    def test_orients_vertical_family_by_y(self):
        self.assertEqual(canonical_direction(1.0, -2.0), (-1.0, 2.0))

    def test_near_vertical_vectors_with_arbitrary_signs_agree(self):
        upward = canonical_direction(0.001, 0.9999995)
        downward = canonical_direction(0.001, -0.9999995)
        self.assertGreater(upward[1], 0.0)
        self.assertGreater(downward[1], 0.0)

    def test_breaks_the_vertical_tie_by_sign_of_dy(self):
        self.assertEqual(canonical_direction(0.0, -1.0), (0.0, 1.0))

    def test_is_idempotent(self):
        for vector in ((-2.0, 1.0), (1.0, -2.0), (0.0, -1.0), (0.0, 1.0)):
            once = canonical_direction(*vector)
            self.assertEqual(canonical_direction(*once), once)


class FitLineTests(unittest.TestCase):
    def test_recovers_a_known_slope(self):
        points = [(x, 2.0 * x + 3.0) for x in range(10)]
        line = fit_line(points)
        self.assertAlmostEqual(line.dy / line.dx, 2.0, places=9)

    def test_handles_a_vertical_line(self):
        # Ordinary least squares diverges here. Half of a graticule is
        # near-vertical, so this case is the normal case, not an edge case.
        line = fit_line([(5.0, y) for y in range(10)])
        self.assertAlmostEqual(abs(line.dx), 0.0, places=9)
        self.assertAlmostEqual(abs(line.dy), 1.0, places=9)

    def test_direction_is_a_unit_vector(self):
        line = fit_line([(0.0, 0.0), (3.0, 4.0)])
        self.assertAlmostEqual(math.hypot(line.dx, line.dy), 1.0, places=12)

    def test_extent_is_the_span_along_the_line(self):
        line = fit_line([(0.0, 0.0), (3.0, 4.0)])
        self.assertAlmostEqual(line.extent_px, 5.0, places=9)

    def test_is_insensitive_to_point_order(self):
        forward = fit_line([(0.0, 0.0), (3.0, 4.0), (6.0, 8.0)])
        backward = fit_line([(6.0, 8.0), (3.0, 4.0), (0.0, 0.0)])
        self.assertAlmostEqual(forward.dx, backward.dx, places=12)
        self.assertAlmostEqual(forward.dy, backward.dy, places=12)

    def test_rejects_a_single_point(self):
        with self.assertRaises(ValueError):
            fit_line([(1.0, 1.0)])

    def test_offset_from_is_signed_perpendicular_distance(self):
        line = FittedLine(cx=0.0, cy=0.0, dx=1.0, dy=0.0, extent_px=10.0, support=1)
        self.assertAlmostEqual(line.offset_from(5.0, 3.0), 3.0)
        self.assertAlmostEqual(line.offset_from(5.0, -3.0), -3.0)


class ScaledTests(unittest.TestCase):
    def test_lifts_a_reduced_crop_back_to_full_sheet(self):
        line = FittedLine(cx=10.0, cy=20.0, dx=1.0, dy=0.0, extent_px=100.0, support=3)
        lifted = line.scaled(4.0, 1050.0, 780.0)
        self.assertEqual((lifted.cx, lifted.cy), (1090.0, 860.0))
        self.assertEqual(lifted.extent_px, 400.0)

    def test_direction_and_support_are_invariant(self):
        line = FittedLine(cx=10.0, cy=20.0, dx=0.6, dy=0.8, extent_px=100.0, support=3)
        lifted = line.scaled(4.0, 1050.0, 780.0)
        self.assertEqual((lifted.dx, lifted.dy, lifted.support), (0.6, 0.8, 3))


class MergeCollinearTests(unittest.TestCase):
    def test_joins_a_rule_broken_into_fragments(self):
        segments = [(0.0, 0.0, 100.0, 0.0), (150.0, 0.0, 300.0, 0.0)]
        lines = merge_collinear(segments, angle_tol=1.5, offset_tol=12.0)
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0].support, 2)
        self.assertAlmostEqual(lines[0].extent_px, 300.0, places=6)

    def test_keeps_parallel_rules_apart(self):
        segments = [(0.0, 0.0, 300.0, 0.0), (0.0, 500.0, 300.0, 500.0)]
        lines = merge_collinear(segments, angle_tol=1.5, offset_tol=12.0)
        self.assertEqual(len(lines), 2)

    def test_keeps_crossing_rules_apart(self):
        segments = [(0.0, 0.0, 300.0, 0.0), (150.0, -150.0, 150.0, 150.0)]
        lines = merge_collinear(segments, angle_tol=1.5, offset_tol=12.0)
        self.assertEqual(len(lines), 2)

    def test_grouping_is_greedy_not_transitive(self):
        # Three segments each within tolerance of the next but spanning far more
        # in total. Transitive chaining would swallow all three into one line,
        # which is how a gently curving river becomes a false graticule rule.
        segments = [
            (0.0, 0.0, 100.0, 0.0),
            (200.0, 10.0, 300.0, 10.0),
            (400.0, 20.0, 500.0, 20.0),
        ]
        lines = merge_collinear(segments, angle_tol=1.5, offset_tol=12.0)
        self.assertEqual(len(lines), 2)

    def test_empty_input(self):
        self.assertEqual(merge_collinear([], 1.5, 12.0), [])


class DominantAnglesTests(unittest.TestCase):
    def test_finds_two_populated_orientations(self):
        segments = [(0.0, float(i), 100.0, float(i)) for i in range(20)]
        segments += [(float(i), 0.0, float(i), 100.0) for i in range(20)]
        primary, secondary = dominant_angles(segments)
        # Smoothing spreads a single-bin spike across the window, so the peak
        # can land anywhere inside it. Half the window is the honest tolerance.
        self.assertLessEqual(angular_distance(primary, 0.0), 2.5)
        self.assertLessEqual(angular_distance(secondary, 90.0), 2.5)

    def test_second_family_is_not_the_first_ones_shoulder(self):
        segments = [(0.0, float(i), 100.0, float(i)) for i in range(40)]
        primary, secondary = dominant_angles(segments, separation_deg=25.0)
        self.assertGreaterEqual(angular_distance(primary, secondary), 25.0)

    def test_rejects_empty_input(self):
        with self.assertRaises(ValueError):
            dominant_angles([])


class SplitFamiliesTests(unittest.TestCase):
    def test_partitions_by_nearest_angle(self):
        horizontal = (0.0, 0.0, 100.0, 0.0)
        vertical = (0.0, 0.0, 0.0, 100.0)
        family_a, family_b = split_families(
            [horizontal, vertical], primary=0.0, secondary=90.0, angle_tol=6.0
        )
        self.assertEqual(family_a, [horizontal])
        self.assertEqual(family_b, [vertical])

    def test_drops_segments_near_neither_family(self):
        diagonal = (0.0, 0.0, 100.0, 100.0)
        family_a, family_b = split_families(
            [diagonal], primary=0.0, secondary=90.0, angle_tol=6.0
        )
        self.assertEqual((family_a, family_b), ([], []))

    def test_a_segment_never_lands_in_both_families(self):
        # Families closer together than 2 * angle_tol, so this segment is within
        # tolerance of BOTH. Without the nearest-wins rule the same rule would be
        # fitted into both lattices. At 4.57 degrees it belongs to the primary.
        ambiguous = (0.0, 0.0, 100.0, 8.0)
        family_a, family_b = split_families(
            [ambiguous], primary=0.0, secondary=10.0, angle_tol=8.0
        )
        self.assertEqual(len(family_a) + len(family_b), 1)
        self.assertEqual(family_a, [ambiguous])


class IntersectTests(unittest.TestCase):
    def test_crosses_two_lines(self):
        a = FittedLine(cx=0.0, cy=0.0, dx=1.0, dy=0.0, extent_px=10.0, support=1)
        b = FittedLine(cx=5.0, cy=0.0, dx=0.0, dy=1.0, extent_px=10.0, support=1)
        crossing = intersect(a, b)
        assert crossing is not None
        self.assertAlmostEqual(crossing[0], 5.0)
        self.assertAlmostEqual(crossing[1], 0.0)

    def test_parallel_lines_do_not_cross(self):
        a = FittedLine(cx=0.0, cy=0.0, dx=1.0, dy=0.0, extent_px=10.0, support=1)
        b = FittedLine(cx=0.0, cy=9.0, dx=1.0, dy=0.0, extent_px=10.0, support=1)
        self.assertIsNone(intersect(a, b))

    def test_does_not_assume_perpendicular_families(self):
        # Church's construction does not put meridians and parallels at right
        # angles in sheet pixels; assuming it would bias every control point.
        a = FittedLine(cx=0.0, cy=0.0, dx=1.0, dy=0.0, extent_px=10.0, support=1)
        b = FittedLine(
            cx=0.0, cy=-10.0, dx=0.6, dy=0.8, extent_px=10.0, support=1
        )
        crossing = intersect(a, b)
        assert crossing is not None
        self.assertAlmostEqual(crossing[0], 7.5)
        self.assertAlmostEqual(crossing[1], 0.0)

    def test_is_symmetric(self):
        a = FittedLine(cx=0.0, cy=0.0, dx=1.0, dy=0.0, extent_px=10.0, support=1)
        b = FittedLine(cx=5.0, cy=0.0, dx=0.3, dy=0.95, extent_px=10.0, support=1)
        forward, backward = intersect(a, b), intersect(b, a)
        assert forward is not None and backward is not None
        self.assertAlmostEqual(forward[0], backward[0], places=9)
        self.assertAlmostEqual(forward[1], backward[1], places=9)


if __name__ == "__main__":
    unittest.main()
