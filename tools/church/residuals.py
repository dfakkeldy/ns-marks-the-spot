"""Accuracy measurement for a georeferenced Church sheet.

Two distinct numbers, easily confused:

`affine_rms_m` - how badly a plain 6-parameter affine fits the control points.
    This is a DISTORTION INDEX, not the accuracy of the delivered layer. A large
    value is the quantitative form of the StFX observation that Church map
    geometry "is so distorted that it is impossible to georeference to the modern
    base map" with simple methods. It is exactly why we warp with -tps.

`check_rms_m` - the error of the delivered thin-plate-spline warp, measured at
    points that were HELD OUT of the warp. This is the honest accuracy figure and
    the only one fit to show a user.

Measuring TPS error at its own control points would always yield ~0, because a
thin-plate spline interpolates its controls exactly. That number would be a lie.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from tools.church.gcps import GroundControlPoint
from tools.church.geometry import mercator_to_ground_metres


@dataclass(frozen=True)
class AffineModel:
    """Pixel-to-EPSG:3857 affine: X = a*px + b*py + c, Y = d*px + e*py + f."""

    a: float
    b: float
    c: float
    d: float
    e: float
    f: float

    def apply(self, pixel_x: float, pixel_y: float) -> tuple[float, float]:
        """Project a pixel coordinate through this model."""
        return (
            self.a * pixel_x + self.b * pixel_y + self.c,
            self.d * pixel_x + self.e * pixel_y + self.f,
        )


def _solve3(matrix: list[list[float]], rhs: list[float]) -> list[float]:
    """Solve a 3x3 linear system by Gaussian elimination with partial pivoting."""
    augmented = [row[:] + [rhs[index]] for index, row in enumerate(matrix)]
    for column in range(3):
        pivot = max(range(column, 3), key=lambda r: abs(augmented[r][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            raise ValueError(
                "control points are degenerate (collinear or coincident); "
                "an affine fit needs points spanning two dimensions"
            )
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        for row in range(3):
            if row == column:
                continue
            factor = augmented[row][column] / augmented[column][column]
            for col in range(column, 4):
                augmented[row][col] -= factor * augmented[column][col]
    return [augmented[i][3] / augmented[i][i] for i in range(3)]


def solve_affine(points: list[GroundControlPoint]) -> AffineModel:
    """Least-squares 6-parameter affine from pixel space to EPSG:3857."""
    if len(points) < 3:
        raise ValueError(f"need at least 3 control points, got {len(points)}")

    count = float(len(points))
    sum_xx = sum_xy = sum_x = sum_yy = sum_y = 0.0
    for point in points:
        sum_xx += point.pixel_x * point.pixel_x
        sum_xy += point.pixel_x * point.pixel_y
        sum_x += point.pixel_x
        sum_yy += point.pixel_y * point.pixel_y
        sum_y += point.pixel_y

    normal = [[sum_xx, sum_xy, sum_x], [sum_xy, sum_yy, sum_y], [sum_x, sum_y, count]]
    rhs_x = [0.0, 0.0, 0.0]
    rhs_y = [0.0, 0.0, 0.0]
    for point in points:
        world_x, world_y = point.mercator
        rhs_x[0] += point.pixel_x * world_x
        rhs_x[1] += point.pixel_y * world_x
        rhs_x[2] += world_x
        rhs_y[0] += point.pixel_x * world_y
        rhs_y[1] += point.pixel_y * world_y
        rhs_y[2] += world_y

    a, b, c = _solve3(normal, rhs_x)
    d, e, f = _solve3(normal, rhs_y)
    return AffineModel(a, b, c, d, e, f)


def residual_metres(points: list[GroundControlPoint], model: AffineModel) -> list[float]:
    """Per-point fit error in GROUND metres (Mercator inflation removed)."""
    errors: list[float] = []
    for point in points:
        predicted_x, predicted_y = model.apply(point.pixel_x, point.pixel_y)
        actual_x, actual_y = point.mercator
        mercator_error = math.hypot(predicted_x - actual_x, predicted_y - actual_y)
        errors.append(mercator_to_ground_metres(mercator_error, point.lat))
    return errors


def rms(values: list[float]) -> float:
    """Root mean square. Zero for an empty list."""
    if not values:
        return 0.0
    return math.sqrt(sum(value * value for value in values) / len(values))


@dataclass(frozen=True)
class AccuracyReport:
    """What we know about a warp's quality, ready for metadata.json."""

    affine_rms_m: float
    control_count: int
    check_count: int
    check_rms_m: float | None = None
    check_p95_m: float | None = None
    check_max_m: float | None = None

    def as_dict(self) -> dict:
        """JSON-serialisable form."""
        return {
            "affine_rms_m": self.affine_rms_m,
            "control_count": self.control_count,
            "check_count": self.check_count,
            "check_rms_m": self.check_rms_m,
            "check_p95_m": self.check_p95_m,
            "check_max_m": self.check_max_m,
        }


def summarise(
    control: list[GroundControlPoint],
    check: list[GroundControlPoint],
    check_errors_m: list[float] | None = None,
) -> AccuracyReport:
    """Build the accuracy report.

    `check_errors_m` comes from transforming held-out points through the actual
    TPS warp (see georeference.py); it is not derivable from the affine fit.
    """
    affine_rms = rms(residual_metres(control, solve_affine(control))) if control else 0.0
    return AccuracyReport(
        affine_rms_m=affine_rms,
        control_count=len(control),
        check_count=len(check),
        check_rms_m=rms(check_errors_m) if check_errors_m else None,
        check_p95_m=(
            sorted(check_errors_m)[math.ceil(0.95 * len(check_errors_m)) - 1]
            if check_errors_m
            else None
        ),
        check_max_m=max(check_errors_m) if check_errors_m else None,
    )
