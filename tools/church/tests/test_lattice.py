import unittest

from tools.church.lattice import (
    candidate_spacings,
    fit_family,
    fit_spacing,
    merge_duplicates,
    perpendicular_offsets,
)
from tools.church.linefit import FittedLine


def vertical(x: float, extent: float = 1000.0, support: int = 1) -> FittedLine:
    return FittedLine(cx=x, cy=0.0, dx=0.0, dy=1.0, extent_px=extent, support=support)


class PerpendicularOffsetsTests(unittest.TestCase):
    def test_offsets_are_spacings_from_the_family_centroid(self):
        lines = [vertical(0.0), vertical(100.0), vertical(200.0)]
        offsets, reference, _, _ = perpendicular_offsets(lines)
        self.assertEqual(reference, (100.0, 0.0))
        # Offsets rise with pixel x, so index 0 always lands on the westernmost
        # rule no matter which way the family happens to be tilted.
        self.assertEqual([round(o, 6) for o in offsets], [-100.0, 0.0, 100.0])

    def test_normal_is_perpendicular_to_the_family_direction(self):
        _, _, direction, normal = perpendicular_offsets([vertical(0.0), vertical(50.0)])
        self.assertAlmostEqual(direction[0] * normal[0] + direction[1] * normal[1], 0.0)

    def test_normal_points_along_increasing_x_whichever_way_the_family_leans(self):
        # The bug this guards reversed every longitude on the south panel: the
        # north meridians lean to 84.5 degrees and the south to 90.1, and the
        # direction canonicalisation flips at exactly 90.
        leaning_left = FittedLine(
            cx=0.0, cy=0.0, dx=-0.002, dy=0.999998, extent_px=1000.0, support=1
        )
        leaning_right = FittedLine(
            cx=0.0, cy=0.0, dx=0.002, dy=0.999998, extent_px=1000.0, support=1
        )
        for family in ([leaning_left], [leaning_right]):
            _, _, _, normal = perpendicular_offsets(family)
            self.assertGreater(normal[0], 0.0)

    def test_a_flipped_direction_does_not_tilt_the_family(self):
        # One line stored with the opposite sign - which a line fit may return
        # at any time - must not drag the family's mean direction.
        upright = [vertical(0.0), vertical(100.0), vertical(200.0)]
        flipped = list(upright)
        flipped[1] = FittedLine(cx=100.0, cy=0.0, dx=0.0, dy=-1.0, extent_px=1000.0, support=1)
        self.assertEqual(
            perpendicular_offsets(upright)[2], perpendicular_offsets(flipped)[2]
        )

    def test_rejects_an_empty_family(self):
        with self.assertRaises(ValueError):
            perpendicular_offsets([])


class MergeDuplicatesTests(unittest.TestCase):
    def test_collapses_two_detections_of_one_rule(self):
        lines = [vertical(0.0, extent=500.0), vertical(5.0, extent=900.0)]
        kept, offsets = merge_duplicates(lines, [0.0, 5.0], tolerance=120.0)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0].extent_px, 900.0)
        self.assertEqual(offsets, [5.0])

    def test_keeps_genuinely_distinct_rules(self):
        lines = [vertical(0.0), vertical(2000.0)]
        kept, _ = merge_duplicates(lines, [0.0, 2000.0], tolerance=120.0)
        self.assertEqual(len(kept), 2)

    def test_result_is_ordered_by_offset(self):
        lines = [vertical(2000.0), vertical(0.0), vertical(1000.0)]
        _, offsets = merge_duplicates(lines, [2000.0, 0.0, 1000.0], tolerance=120.0)
        self.assertEqual(offsets, sorted(offsets))

    def test_rejects_mismatched_lengths(self):
        with self.assertRaises(ValueError):
            merge_duplicates([vertical(0.0)], [0.0, 1.0], tolerance=1.0)


class CandidateSpacingsTests(unittest.TestCase):
    def test_includes_integer_fractions_of_observed_gaps(self):
        candidates = candidate_spacings([0.0, 1000.0], tolerance=10.0)
        for expected in (1000.0, 500.0, 1000.0 / 3.0, 250.0):
            self.assertTrue(any(abs(c - expected) < 1e-9 for c in candidates))

    def test_drops_fractions_smaller_than_the_tolerance_allows(self):
        # Below 2 * tolerance the fit tolerance alone would admit almost any
        # pitch, so such candidates carry no evidence.
        for candidate in candidate_spacings([0.0, 1000.0], tolerance=200.0):
            self.assertGreater(candidate, 400.0)


class FitSpacingTests(unittest.TestCase):
    def test_recovers_a_regular_pitch(self):
        fit = fit_spacing([0.0, 100.0, 200.0, 300.0], tolerance=10.0)
        assert fit is not None
        self.assertAlmostEqual(fit.spacing, 100.0, places=6)
        self.assertEqual(fit.indices, (0, 1, 2, 3))
        self.assertAlmostEqual(fit.rms, 0.0, places=9)

    def test_a_missing_rule_becomes_a_gap_in_the_indices(self):
        # Index 2 absent. The pitch must still come back as 100, not 150.
        fit = fit_spacing([0.0, 100.0, 300.0, 400.0], tolerance=10.0)
        assert fit is not None
        self.assertAlmostEqual(fit.spacing, 100.0, places=6)
        self.assertEqual(fit.indices, (0, 1, 3, 4))

    def test_prefers_the_largest_pitch_that_fits(self):
        # A pitch of 50 fits this data exactly as well, and would invent a
        # phantom rule between every real pair before reporting them missing.
        fit = fit_spacing([0.0, 100.0, 200.0, 300.0], tolerance=10.0)
        assert fit is not None
        self.assertAlmostEqual(fit.spacing, 100.0, places=6)
        self.assertEqual(fit.indices, (0, 1, 2, 3))

    def test_returns_none_when_no_candidate_pitch_survives(self):
        # Every fraction of the only gap is below 2 * tolerance, so there is no
        # candidate carrying any evidence and the fit declines to guess.
        self.assertIsNone(fit_spacing([0.0, 100.0], tolerance=60.0))

    def test_a_fine_enough_pitch_can_thread_arbitrary_positions(self):
        # Documented limitation, not a bug: with a loose enough tolerance
        # relative to the pitch, some small spacing always fits. It is the
        # extent filter and a tolerance scaled to the sheet that keep this
        # honest - a pitch of 12 px across a 28,000 px panel would imply
        # thousands of rules, and the missing-index report makes that obvious.
        fit = fit_spacing([0.0, 100.0, 137.0, 601.0], tolerance=1.0)
        assert fit is not None
        self.assertLess(fit.spacing, 20.0)
        self.assertGreater(max(fit.indices), 40)

    def test_returns_none_for_a_single_line(self):
        self.assertIsNone(fit_spacing([0.0], tolerance=10.0))

    def test_tolerates_jitter_within_tolerance(self):
        fit = fit_spacing([0.0, 104.0, 197.0, 301.0], tolerance=10.0)
        assert fit is not None
        self.assertAlmostEqual(fit.spacing, 100.0, delta=3.0)
        self.assertLessEqual(fit.rms, 10.0)


class FitFamilyTests(unittest.TestCase):
    def test_fits_indexes_and_deduplicates_in_one_pass(self):
        lines = [
            vertical(0.0, extent=5000.0),
            vertical(30.0, extent=6000.0),   # duplicate detection of the first
            vertical(2000.0, extent=5000.0),
            vertical(4000.0, extent=5000.0),
        ]
        family = fit_family(lines, tolerance=120.0, min_extent=3500.0)
        assert family is not None
        self.assertEqual(family.indices, (0, 1, 2))
        self.assertAlmostEqual(family.spacing_px, 1985.0, delta=25.0)

    def test_drops_lines_shorter_than_the_minimum_extent(self):
        lines = [vertical(0.0, extent=5000.0), vertical(2000.0, extent=100.0)]
        self.assertIsNone(fit_family(lines, tolerance=120.0, min_extent=3500.0))

    def test_reports_missing_lattice_positions(self):
        lines = [
            vertical(0.0, extent=5000.0),
            vertical(1000.0, extent=5000.0),
            vertical(3000.0, extent=5000.0),
        ]
        family = fit_family(lines, tolerance=50.0, min_extent=0.0)
        assert family is not None
        # Lines at x = 0, 1000, 3000: index counts from the westernmost, and the
        # empty position is reported rather than filled with a phantom rule.
        self.assertEqual(family.indices, (0, 1, 3))
        self.assertEqual(family.missing_indices, (2,))

    def test_returns_none_when_no_candidate_pitch_survives(self):
        lines = [vertical(x, extent=5000.0) for x in (0.0, 100.0)]
        self.assertIsNone(fit_family(lines, tolerance=60.0, min_extent=0.0))


if __name__ == "__main__":
    unittest.main()
