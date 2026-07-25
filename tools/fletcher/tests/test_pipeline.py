from __future__ import annotations

import unittest

from tools.fletcher.pipeline import (
    AccuracyGate,
    CandidateAccuracy,
    choose_best_candidate,
    resumable_sheet_ids,
)


class AccuracyGateTests(unittest.TestCase):
    def test_accepts_metrics_at_every_limit(self) -> None:
        verdict = AccuracyGate().evaluate(
            control_count=8,
            check_count=4,
            rms_m=400.0,
            p95_m=900.0,
            max_m=1500.0,
        )

        self.assertTrue(verdict.passed)
        self.assertEqual(verdict.reason, "")

    def test_rejects_missing_held_out_checks(self) -> None:
        verdict = AccuracyGate().evaluate(
            control_count=8,
            check_count=0,
            rms_m=None,
            p95_m=None,
            max_m=None,
        )

        self.assertFalse(verdict.passed)
        self.assertEqual(verdict.reason, "no held-out check points")

    def test_reports_every_exceeded_limit_without_loosening_the_gate(self) -> None:
        verdict = AccuracyGate().evaluate(
            control_count=8,
            check_count=4,
            rms_m=401.0,
            p95_m=901.0,
            max_m=1501.0,
        )

        self.assertFalse(verdict.passed)
        self.assertEqual(
            verdict.reason,
            "RMS 401.0 m > 400 m; P95 901.0 m > 900 m; max 1501.0 m > 1500 m",
        )


class CandidateSelectionTests(unittest.TestCase):
    def test_chooses_the_lowest_held_out_rms_not_the_default_method(self) -> None:
        winner = choose_best_candidate(
            [
                CandidateAccuracy("tps", 8, 4, 250.0, 500.0, 700.0),
                CandidateAccuracy("affine", 8, 4, 120.0, 200.0, 250.0),
                CandidateAccuracy("polynomial2", 8, 4, 180.0, 300.0, 350.0),
            ]
        )

        self.assertEqual(winner.method, "affine")

    def test_refuses_to_call_an_unchecked_candidate_a_winner(self) -> None:
        with self.assertRaisesRegex(ValueError, "held-out"):
            choose_best_candidate(
                [CandidateAccuracy("tps", 8, 0, None, None, None)]
            )


class ResumePlanningTests(unittest.TestCase):
    def test_skips_tiled_sheets_but_retries_failed_and_interrupted_sheets(self) -> None:
        pending = resumable_sheet_ids(
            ["17", "18", "19", "20"],
            {
                "17": {"stage": "tiled"},
                "18": {"stage": "failed"},
                "19": {"stage": "warped"},
            },
        )

        self.assertEqual(pending, ["18", "19", "20"])


if __name__ == "__main__":
    unittest.main()
