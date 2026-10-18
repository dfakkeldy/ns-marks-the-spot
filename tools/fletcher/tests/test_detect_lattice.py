from __future__ import annotations

import unittest

from tools.fletcher.detect_lattice import select_regular_positions


class DetectLatticeTests(unittest.TestCase):
    def test_selects_the_long_regular_sequence_among_strong_outliers(self) -> None:
        candidates = [
            (390.0, 1_450.0),
            (449.0, 1_434.0),
            (905.0, 1_430.0),
            (1_363.0, 1_624.0),
            (1_820.0, 1_421.0),
            (2_274.0, 1_529.0),
            (2_444.0, 1_456.0),
        ]

        selected = select_regular_positions(
            candidates,
            expected_spacing=456.0,
            spacing_tolerance=20.0,
            position_tolerance=15.0,
            minimum_count=4,
        )

        self.assertEqual(selected, [449.0, 905.0, 1_363.0, 1_820.0, 2_274.0])

    def test_refuses_a_sequence_that_is_too_short(self) -> None:
        with self.assertRaisesRegex(ValueError, "regular sequence"):
            select_regular_positions(
                [(100.0, 50.0), (200.0, 50.0)],
                expected_spacing=100.0,
                spacing_tolerance=5.0,
                position_tolerance=3.0,
                minimum_count=3,
            )


if __name__ == "__main__":
    unittest.main()
