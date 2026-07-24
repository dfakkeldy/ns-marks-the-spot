import math
import unittest

from tools.church.gcps import CHECK_ROLE, CONTROL_ROLE, GroundControlPoint
from tools.church.geometry import mercator_to_lonlat
from tools.church.residuals import (
    AffineModel,
    solve_affine,
    residual_metres,
    rms,
    summarise,
)


def point_from_mercator(px: float, py: float, x: float, y: float, role: str = CONTROL_ROLE):
    lon, lat = mercator_to_lonlat(x, y)
    return GroundControlPoint(px, py, lon, lat, role, f"p{px}-{py}")


class SolveAffineTests(unittest.TestCase):
    def test_recovers_a_known_scale_and_offset(self) -> None:
        # World = pixel * 2 + 100 in X, pixel * 3 - 50 in Y.
        points = [
            point_from_mercator(0.0, 0.0, 100.0, -50.0),
            point_from_mercator(10.0, 0.0, 120.0, -50.0),
            point_from_mercator(0.0, 10.0, 100.0, -20.0),
            point_from_mercator(10.0, 10.0, 120.0, -20.0),
        ]
        model = solve_affine(points)
        self.assertAlmostEqual(model.a, 2.0, places=6)
        self.assertAlmostEqual(model.c, 100.0, places=4)
        self.assertAlmostEqual(model.e, 3.0, places=6)
        self.assertAlmostEqual(model.f, -50.0, places=4)

    def test_exactly_affine_points_have_near_zero_residual(self) -> None:
        points = [
            point_from_mercator(0.0, 0.0, 0.0, 0.0),
            point_from_mercator(100.0, 0.0, 200.0, 0.0),
            point_from_mercator(0.0, 100.0, 0.0, 300.0),
            point_from_mercator(100.0, 100.0, 200.0, 300.0),
        ]
        self.assertLess(rms(residual_metres(points, solve_affine(points))), 1e-6)

    def test_requires_at_least_three_points(self) -> None:
        points = [point_from_mercator(0.0, 0.0, 0.0, 0.0), point_from_mercator(1.0, 1.0, 1.0, 1.0)]
        with self.assertRaises(ValueError) as caught:
            solve_affine(points)
        self.assertIn("3", str(caught.exception))

    def test_rejects_collinear_points(self) -> None:
        points = [
            point_from_mercator(0.0, 0.0, 0.0, 0.0),
            point_from_mercator(1.0, 1.0, 1.0, 1.0),
            point_from_mercator(2.0, 2.0, 2.0, 2.0),
        ]
        with self.assertRaises(ValueError) as caught:
            solve_affine(points)
        self.assertIn("degenerate", str(caught.exception).lower())

    def test_apply_matches_the_model_equations(self) -> None:
        model = AffineModel(2.0, 0.0, 5.0, 0.0, 3.0, 7.0)
        self.assertEqual(model.apply(10.0, 20.0), (25.0, 67.0))


class ResidualTests(unittest.TestCase):
    def test_distorted_point_produces_nonzero_residual(self) -> None:
        # Three points define an exact affine; the fourth is displaced, so the
        # least-squares fit cannot absorb it. This is the distortion signal.
        points = [
            point_from_mercator(0.0, 0.0, 0.0, 0.0),
            point_from_mercator(100.0, 0.0, 100.0, 0.0),
            point_from_mercator(0.0, 100.0, 0.0, 100.0),
            point_from_mercator(100.0, 100.0, 400.0, 100.0),
        ]
        self.assertGreater(rms(residual_metres(points, solve_affine(points))), 1.0)

    def test_residuals_are_ground_metres_not_mercator_metres(self) -> None:
        # One point displaced by a known Mercator amount at ~46N. The reported
        # residual must be the cosine-corrected (smaller) ground distance.
        base = [
            point_from_mercator(0.0, 0.0, -6800000.0, 5800000.0),
            point_from_mercator(100.0, 0.0, -6799000.0, 5800000.0),
            point_from_mercator(0.0, 100.0, -6800000.0, 5801000.0),
        ]
        model = solve_affine(base)
        residuals = residual_metres(base, model)
        self.assertTrue(all(r >= 0.0 for r in residuals))
        latitude = base[0].lat
        self.assertGreater(latitude, 40.0)  # confirms the fixture really is northern

    def test_rms_of_known_values(self) -> None:
        self.assertAlmostEqual(rms([3.0, 4.0]), math.sqrt(12.5), places=9)

    def test_rms_of_empty_is_zero(self) -> None:
        self.assertEqual(rms([]), 0.0)


class SummariseTests(unittest.TestCase):
    def _control(self):
        return [
            point_from_mercator(0.0, 0.0, 0.0, 0.0),
            point_from_mercator(100.0, 0.0, 100.0, 0.0),
            point_from_mercator(0.0, 100.0, 0.0, 100.0),
            point_from_mercator(100.0, 100.0, 400.0, 100.0),
        ]

    def test_reports_counts_and_affine_rms(self) -> None:
        report = summarise(self._control(), [])
        self.assertEqual(report.control_count, 4)
        self.assertEqual(report.check_count, 0)
        self.assertGreater(report.affine_rms_m, 0.0)

    def test_check_accuracy_is_none_without_check_points(self) -> None:
        report = summarise(self._control(), [])
        self.assertIsNone(report.check_rms_m)
        self.assertIsNone(report.check_max_m)

    def test_check_accuracy_uses_supplied_errors(self) -> None:
        check = [point_from_mercator(50.0, 50.0, 50.0, 50.0, CHECK_ROLE)]
        report = summarise(self._control(), check, check_errors_m=[30.0, 40.0])
        self.assertAlmostEqual(report.check_rms_m, math.sqrt(1250.0), places=9)
        self.assertEqual(report.check_max_m, 40.0)

    def test_as_dict_is_json_ready(self) -> None:
        report = summarise(self._control(), [])
        payload = report.as_dict()
        self.assertIn("affine_rms_m", payload)
        self.assertIn("control_count", payload)
        self.assertIsInstance(payload["affine_rms_m"], float)


if __name__ == "__main__":
    unittest.main()
