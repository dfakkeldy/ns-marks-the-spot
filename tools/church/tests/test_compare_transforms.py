import unittest

from tools.church.compare_transforms import (
    GATES,
    comparison_result,
    passes_gates,
    select_simplest,
)
from tools.church.residuals import AccuracyReport


def report(rms: float, p95: float, maximum: float) -> AccuracyReport:
    return AccuracyReport(
        affine_rms_m=100.0,
        control_count=14,
        check_count=11,
        check_rms_m=rms,
        check_p95_m=p95,
        check_max_m=maximum,
    )


class GateTests(unittest.TestCase):
    def test_accepts_values_on_fixed_boundaries(self) -> None:
        self.assertTrue(passes_gates(report(400.0, 900.0, 1500.0)))

    def test_rejects_each_failed_metric(self) -> None:
        self.assertFalse(passes_gates(report(400.1, 800.0, 1400.0)))
        self.assertFalse(passes_gates(report(300.0, 900.1, 1400.0)))
        self.assertFalse(passes_gates(report(300.0, 800.0, 1500.1)))

    def test_rejects_missing_held_out_evidence(self) -> None:
        self.assertFalse(
            passes_gates(
                AccuracyReport(
                    affine_rms_m=100.0,
                    control_count=14,
                    check_count=0,
                )
            )
        )


class SelectionTests(unittest.TestCase):
    def test_selects_simplest_passing_model(self) -> None:
        results = [
            comparison_result("affine", report(401.0, 500.0, 700.0)),
            comparison_result("polynomial2", report(350.0, 700.0, 1000.0)),
            comparison_result("tps", report(200.0, 400.0, 600.0)),
        ]
        self.assertEqual(select_simplest(results), "polynomial2")

    def test_returns_none_when_every_model_fails(self) -> None:
        results = [
            comparison_result("affine", report(401.0, 500.0, 700.0)),
            comparison_result("polynomial2", report(500.0, 700.0, 1000.0)),
            comparison_result("tps", report(800.0, 1000.0, 1600.0)),
        ]
        self.assertIsNone(select_simplest(results))

    def test_result_records_fixed_gates_and_accuracy(self) -> None:
        result = comparison_result("tps", report(200.0, 400.0, 600.0))
        self.assertEqual(result["gates_m"], GATES)
        self.assertEqual(result["accuracy"]["check_count"], 11)
        self.assertTrue(result["passes"])


if __name__ == "__main__":
    unittest.main()
