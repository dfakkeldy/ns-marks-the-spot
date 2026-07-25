from __future__ import annotations

import unittest

from tools.fletcher.qa import anchor_windows


class QATests(unittest.TestCase):
    def test_anchor_windows_track_the_scan_dimensions(self) -> None:
        longitude, latitude = anchor_windows(10_873, 7_642)

        self.assertEqual(longitude, (1_196, 610, 1_200, 700))
        self.assertEqual(latitude, (500, 811, 1_300, 900))

    def test_detected_lines_override_the_pilot_ratios(self) -> None:
        longitude, latitude = anchor_windows(
            10_832,
            7_683,
            meridian_x=2_635.2,
            parallel_y=1_137.3,
        )

        self.assertEqual(longitude, (2_035, 616, 1_200, 700))
        self.assertEqual(latitude, (500, 687, 1_300, 900))


if __name__ == "__main__":
    unittest.main()
