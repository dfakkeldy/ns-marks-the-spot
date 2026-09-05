"""Paired source-probe checks; nominal dimensions cannot prove native detail."""

import unittest

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = np = None


@unittest.skipIf(cv2 is None, "optional NumPy/OpenCV dependencies absent")
class SourceDetailTest(unittest.TestCase):
    def test_enlarged_thumbnail_is_flagged_despite_equal_dimensions(self):
        from tools.fletcher.source_detail import compare_detail

        rng = np.random.default_rng(9)
        native = rng.integers(30, 220, (128, 128), dtype=np.uint8)
        thumbnail = cv2.resize(native, (16, 16), interpolation=cv2.INTER_AREA)
        enlarged = cv2.resize(thumbnail, (128, 128), interpolation=cv2.INTER_LINEAR)
        self.assertEqual(compare_detail(enlarged, native)["status"], "detail-loss")

    def test_identical_native_probe_passes(self):
        from tools.fletcher.source_detail import compare_detail

        native = np.random.default_rng(3).integers(30, 220, (128, 128), dtype=np.uint8)
        self.assertEqual(compare_detail(native, native)["status"], "consistent-detail")

    def test_blank_probe_cannot_certify_detail(self):
        from tools.fletcher.source_detail import compare_detail

        blank = np.full((128, 128), 200, np.uint8)
        self.assertEqual(compare_detail(blank, blank)["status"], "inconclusive")
