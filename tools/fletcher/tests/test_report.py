from __future__ import annotations

import unittest

from tools.fletcher.report import render_results


class ReportTests(unittest.TestCase):
    def test_report_preserves_scoped_permission_and_method_limit(self) -> None:
        rendered = render_results({"sheets": {}}, sheet_numbers=[])
        normalized = " ".join(rendered.split())

        self.assertIn(
            "your use is permitted without charge",
            normalized,
        )
        self.assertIn(
            "direct-Rumsey georeferencing use described for the free Nova "
            "Scotia web map",
            normalized,
        )
        self.assertIn(
            "does not clear OldMapsOnline-derived tiles, warps or control "
            "points",
            normalized,
        )
        self.assertIn(
            "used both to compare candidate transform families and to report "
            "the selected transform",
            normalized,
        )

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
                    "gate_reason": "held-out thresholds and visual QA passed",
                    "tile_png_count": 8080,
                    "reason": "held-out thresholds satisfied",
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
        self.assertIn("held-out thresholds and visual QA passed", rendered)
        self.assertNotIn(
            "| held-out thresholds satisfied |",
            rendered,
        )
        self.assertIn("no reviewable lattice", rendered)
        self.assertIn("observed without a held-out result", rendered)
        self.assertIn("## What next", rendered)


if __name__ == "__main__":
    unittest.main()
