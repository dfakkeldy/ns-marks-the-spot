"""Tests for the source-only extraction pilot (optional image dependencies)."""

import unittest

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = np = None


@unittest.skipIf(cv2 is None, "optional NumPy/OpenCV dependencies absent")
class ExtractionTest(unittest.TestCase):
    def test_dark_stroke_survives_coloured_hatched_background(self):
        from tools.fletcher.extraction_pilot import extract

        im = np.full((240, 240, 3), [145, 135, 85], np.uint8)
        for x in range(0, 240, 24):
            cv2.line(im, (x, 0), (x, 239), (225, 211, 160), 3)
        cv2.line(im, (10, 120), (230, 120), (40, 42, 28), 3)
        result = extract(im)
        self.assertGreater(result["mask"][120, 20:220].mean(), 0.9)
        self.assertLess(result["mask"][:90].mean(), 0.02)

    def test_coloured_geology_and_red_text_do_not_become_water(self):
        from tools.fletcher.extraction_pilot import extract

        im = np.full((240, 240, 3), [230, 150, 90], np.uint8)
        cv2.line(im, (10, 120), (230, 120), (205, 30, 20), 5)
        self.assertEqual(int(extract(im)["mask"].sum()), 0)

    def test_point_support_has_explicit_empty_denominator(self):
        from tools.fletcher.extraction_pilot import point_support

        mask = np.zeros((40, 40), np.uint8)
        self.assertIsNone(point_support(mask, []))
        self.assertEqual(point_support(mask, [[20, 20]]), 0)
