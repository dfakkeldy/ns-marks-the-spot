from __future__ import annotations

import unittest

from tools.fletcher.report import render_results


class ReportTests(unittest.TestCase):
    def test_report_keeps_pass_and_failure_evidence_distinct(self) -> None:
        manifest = {
            "sheets": {
                "17": {
                    "stage": "tiled",
                    "rumsey_id": "rumsey-17",
                    "selected_method": "tps",
                    "control_count": 6,
                    "check_count": 4,
                    "check_rms_m": 9.4,
                    "check_p95_m": 16.2,
                    "check_max_m": 16.2,
                    "gate": "PASS",
                    "tile_png_count": 8080,
                    "reason": "",
                },
                "18": {
                    "stage": "failed",
                    "rumsey_id": "rumsey-18",
                    "gate": "FAIL",
                    "reason": "no reviewable lattice",
                },
                "19": {
                    "stage": "observed",
                    "rumsey_id": "rumsey-19",
                },
            }
        }

        rendered = render_results(manifest, sheet_numbers=[17, 18, 19])

        self.assertIn("| 17 |", rendered)
        self.assertIn("9.4", rendered)
        self.assertIn("no reviewable lattice", rendered)
        self.assertIn("observed without a held-out result", rendered)
        self.assertIn("## What next", rendered)


if __name__ == "__main__":
    unittest.main()
