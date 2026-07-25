from __future__ import annotations

import unittest

from tools.fletcher.grids import REVIEWED_GRIDS
from tools.fletcher.prepare_series import build_observation


class PrepareSeriesTests(unittest.TestCase):
    def test_observation_preserves_source_receipt_and_reviewed_roles(self) -> None:
        observation = build_observation(
            4,
            REVIEWED_GRIDS[4],
            rumsey_id="rumsey-4",
            source_sha256="abc123",
        )

        self.assertEqual(observation["sheet"], "sheet-04")
        self.assertEqual(observation["rumsey_id"], "rumsey-4")
        self.assertEqual(observation["source_sha256"], "abc123")
        self.assertEqual(len(observation["meridians"]), 4)
        self.assertGreaterEqual(len(observation["check_intersections"]), 2)


if __name__ == "__main__":
    unittest.main()
