"""Structural and visual QA for the Sheet 24 modern-feature warp."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import statistics
from collections import deque
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from types import MappingProxyType


REQUIRED_ARTIFACTS = (
    "candidate_contact_sheet",
    "transport_control_crops",
    "natural_check_crops",
    "transport_residual_vectors",
    "natural_residual_vectors",
    "warped_preview",
    "transportation_overlay",
    "hydrography_overlay",
    "alpha_coverage",
    "tile_sample_z8",
    "tile_sample_z12",
    "tile_sample_z16",
)
OPTIONAL_ARTIFACTS = ("nsprd_overlay", "aerial_overlay")
VISUAL_CHECKS = (
    "upright",
    "not_mirrored",
    "no_folding",
    "no_duplicate_geography",
    "reasonable_stretch",
    "single_alpha_component",
    "no_transparent_slivers",
    "no_border_leakage",
    "coordinate_signs",
    "transport_identity",
    "natural_alignment",
    "tile_samples",
    "shared_boundary_if_applicable",
)
_HASH_LENGTH = 64
_REVIEW_VALUES = frozenset({"PASS", "FAIL", "NOT_APPLICABLE"})

Point = tuple[float, float]
Transform = Callable[[float, float], Point]


@dataclass(frozen=True)
class StructuralMetrics:
    """Finite summary of the sampled transform and retained mesh."""

    sample_count: int
    cell_count: int
    determinant_min: float
    determinant_max: float
    anisotropy_max: float
    area_scale_min: float
    area_scale_median: float
    area_scale_max: float
    mesh_components: int
    overlapping_cell_pairs: int


@dataclass(frozen=True)
class StructuralVerdict:
    """Complete structural outcome, including every detected violation."""

    passed: bool
    reason: str
    sample_grid: tuple[int, int]
    metrics: StructuralMetrics


@dataclass(frozen=True)
class ArtifactFile:
    """One hash-bound QA artifact."""

    path: str
    sha256: str


@dataclass(frozen=True)
class ArtifactInventory:
    """The observation-bound collection of required QA evidence."""

    observation_sha256: str
    artifacts: Mapping[str, tuple[ArtifactFile, ...]]


@dataclass(frozen=True)
class VisualReview:
    """A human visual verdict bound to the observation and artifact bytes."""

    gate: str
    observation_sha256: str
    checks: Mapping[str, str]
    artifact_inventory: ArtifactInventory
    optional_artifact_uses: Mapping[str, str]


def _cross(first: Point, second: Point, third: Point) -> float:
    return (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (
        third[0] - first[0]
    )


def _on_segment(first: Point, second: Point, point: Point) -> bool:
    epsilon = 1e-9
    return (
        abs(_cross(first, second, point)) <= epsilon
        and min(first[0], second[0]) - epsilon
        <= point[0]
        <= max(first[0], second[0]) + epsilon
        and min(first[1], second[1]) - epsilon
        <= point[1]
        <= max(first[1], second[1]) + epsilon
    )


def _inside_or_on(point: Point, polygon: Sequence[Point]) -> bool:
    edges = zip(polygon, (*polygon[1:], polygon[0]), strict=True)
    if any(_on_segment(first, second, point) for first, second in edges):
        return True
    x, y = point
    inside = False
    for first, second in zip(polygon, (*polygon[1:], polygon[0]), strict=True):
        if (first[1] > y) != (second[1] > y):
            crossing_x = (second[0] - first[0]) * (y - first[1]) / (
                second[1] - first[1]
            ) + first[0]
            if x < crossing_x:
                inside = not inside
    return inside


def _convex_hull(points: Sequence[Point]) -> tuple[Point, ...]:
    unique = sorted({(float(x), float(y)) for x, y in points})
    if len(unique) < 3:
        return ()

    def half(values: Sequence[Point]) -> list[Point]:
        result: list[Point] = []
        for point in values:
            while len(result) >= 2 and _cross(result[-2], result[-1], point) <= 0:
                result.pop()
            result.append(point)
        return result

    lower = half(unique)
    upper = half(tuple(reversed(unique)))
    return tuple(lower[:-1] + upper[:-1])


def _strict_segment_intersection(
    first: Point, second: Point, third: Point, fourth: Point
) -> bool:
    one = _cross(first, second, third)
    two = _cross(first, second, fourth)
    three = _cross(third, fourth, first)
    four = _cross(third, fourth, second)
    epsilon = 1e-9
    return (
        (one > epsilon and two < -epsilon) or (one < -epsilon and two > epsilon)
    ) and (
        (three > epsilon and four < -epsilon) or (three < -epsilon and four > epsilon)
    )


def _strictly_inside(point: Point, polygon: Sequence[Point]) -> bool:
    if any(
        _on_segment(first, second, point)
        for first, second in zip(polygon, (*polygon[1:], polygon[0]), strict=True)
    ):
        return False
    return _inside_or_on(point, polygon)


def _polygons_overlap(first: Sequence[Point], second: Sequence[Point]) -> bool:
    if (
        max(point[0] for point in first) <= min(point[0] for point in second)
        or max(point[0] for point in second) <= min(point[0] for point in first)
        or max(point[1] for point in first) <= min(point[1] for point in second)
        or max(point[1] for point in second) <= min(point[1] for point in first)
    ):
        return False
    first_edges = tuple(zip(first, (*first[1:], first[0]), strict=True))
    second_edges = tuple(zip(second, (*second[1:], second[0]), strict=True))
    if any(
        _strict_segment_intersection(a, b, c, d)
        for a, b in first_edges
        for c, d in second_edges
    ):
        return True
    first_centre = (
        sum(point[0] for point in first) / len(first),
        sum(point[1] for point in first) / len(first),
    )
    second_centre = (
        sum(point[0] for point in second) / len(second),
        sum(point[1] for point in second) / len(second),
    )
    return (
        _strictly_inside(first_centre, second)
        or _strictly_inside(second_centre, first)
        or any(_strictly_inside(point, second) for point in first)
        or any(_strictly_inside(point, first) for point in second)
    )


def _polygon_self_intersects(polygon: Sequence[Point]) -> bool:
    if len(polygon) != 4:
        raise ValueError("mesh cells must be quadrilaterals")
    return _strict_segment_intersection(
        polygon[0], polygon[1], polygon[2], polygon[3]
    ) or _strict_segment_intersection(polygon[1], polygon[2], polygon[3], polygon[0])


def _component_count(cells: set[tuple[int, int]]) -> int:
    remaining = set(cells)
    components = 0
    while remaining:
        components += 1
        queue = [remaining.pop()]
        while queue:
            row, column = queue.pop()
            for neighbour in (
                (row - 1, column),
                (row + 1, column),
                (row, column - 1),
                (row, column + 1),
            ):
                if neighbour in remaining:
                    remaining.remove(neighbour)
                    queue.append(neighbour)
    return components


def _finite_range(values: Sequence[float]) -> tuple[float, float]:
    finite = [value for value in values if math.isfinite(value)]
    return (min(finite), max(finite)) if finite else (0.0, 0.0)


def evaluate_structure(
    transform: Transform,
    frame_polygon: Sequence[Point],
    control_pixels: Sequence[Point],
    grid_size: int = 21,
    step_px: float = 1.0,
) -> StructuralVerdict:
    """Evaluate local Jacobians and global mesh topology before final checks."""
    if grid_size != 21:
        raise ValueError("the structural gate requires an exact 21x21 mesh")
    if not math.isfinite(step_px) or step_px <= 0:
        raise ValueError("step_px must be finite and positive")
    frame = tuple((float(x), float(y)) for x, y in frame_polygon)
    if len(frame) < 3:
        raise ValueError("frame_polygon needs at least three vertices")
    hull = _convex_hull(control_pixels)
    if not hull:
        raise ValueError("control_pixels need a two-dimensional convex hull")

    minimum_x = min(point[0] for point in frame)
    maximum_x = max(point[0] for point in frame)
    minimum_y = min(point[1] for point in frame)
    maximum_y = max(point[1] for point in frame)
    if minimum_x == maximum_x or minimum_y == maximum_y:
        raise ValueError("frame_polygon has an empty axis")
    xs = tuple(
        minimum_x + index * (maximum_x - minimum_x) / (grid_size - 1)
        for index in range(grid_size)
    )
    ys = tuple(
        minimum_y + index * (maximum_y - minimum_y) / (grid_size - 1)
        for index in range(grid_size)
    )
    usable = {
        (row, column)
        for row, y in enumerate(ys)
        for column, x in enumerate(xs)
        if _inside_or_on((x, y), frame) and _inside_or_on((x, y), hull)
    }
    cells = {
        (row, column)
        for row in range(grid_size - 1)
        for column in range(grid_size - 1)
        if {
            (row, column),
            (row, column + 1),
            (row + 1, column),
            (row + 1, column + 1),
        }
        <= usable
    }
    violations: list[str] = []
    if not cells:
        violations.append("no complete mesh cell survives the frame and control hull")

    cache: dict[Point, Point] = {}

    def projected(x: float, y: float) -> Point:
        key = (x, y)
        if key not in cache:
            result = transform(x, y)
            if len(result) != 2:
                raise ValueError("transform must return exactly two components")
            cache[key] = (float(result[0]), float(result[1]))
        return cache[key]

    determinants: list[float] = []
    anisotropies: list[float] = []
    area_scales: list[float] = []
    nonfinite_count = 0
    nonpositive_count = 0
    anisotropy_count = 0
    for row, column in sorted(usable):
        x, y = xs[column], ys[row]
        try:
            dx0, dy0 = projected(x - step_px, y)
            dx1, dy1 = projected(x + step_px, y)
            ex0, ey0 = projected(x, y - step_px)
            ex1, ey1 = projected(x, y + step_px)
            components = (
                (dx1 - dx0) / (2 * step_px),
                (ex1 - ex0) / (2 * step_px),
                (dy1 - dy0) / (2 * step_px),
                (ey1 - ey0) / (2 * step_px),
            )
        except (ArithmeticError, OverflowError, ValueError):
            nonfinite_count += 1
            continue
        if not all(math.isfinite(value) for value in components):
            nonfinite_count += 1
            continue
        a, b, c, d = components
        determinant = a * d - b * c
        trace_jtj = a * a + b * b + c * c + d * d
        discriminant = trace_jtj * trace_jtj - 4.0 * determinant * determinant
        root = math.sqrt(max(0.0, discriminant))
        smax = math.sqrt(max(0.0, (trace_jtj + root) / 2.0))
        smin = math.sqrt(max(0.0, (trace_jtj - root) / 2.0))
        anisotropy = math.inf if smin == 0.0 else smax / smin
        area_scale = abs(determinant)
        determinants.append(determinant)
        anisotropies.append(anisotropy)
        area_scales.append(area_scale)
        if not math.isfinite(determinant) or not math.isfinite(anisotropy):
            nonfinite_count += 1
        if determinant <= 0:
            nonpositive_count += 1
        if anisotropy > 4.0:
            anisotropy_count += 1
    if nonfinite_count:
        violations.append(
            f"non-finite transform or Jacobian components at {nonfinite_count} mesh samples"
        )
    if nonpositive_count:
        violations.append(
            f"non-positive determinant at {nonpositive_count} mesh samples"
        )
    if anisotropy_count:
        violations.append(f"anisotropy exceeds 4:1 at {anisotropy_count} mesh samples")

    finite_area_scales = [
        value for value in area_scales if math.isfinite(value) and value > 0
    ]
    median_area = statistics.median(finite_area_scales) if finite_area_scales else 0.0
    area_outliers = (
        [
            value
            for value in finite_area_scales
            if value < 0.25 * median_area or value > 4.0 * median_area
        ]
        if median_area > 0
        else []
    )
    if area_outliers:
        violations.append(
            f"area scale outside 0.25x-4x mesh median at {len(area_outliers)} samples"
        )

    transformed_cells: dict[tuple[int, int], tuple[Point, ...]] = {}
    cell_nonfinite = 0
    for row, column in sorted(cells):
        try:
            quadrilateral = (
                projected(xs[column], ys[row]),
                projected(xs[column + 1], ys[row]),
                projected(xs[column + 1], ys[row + 1]),
                projected(xs[column], ys[row + 1]),
            )
        except (ArithmeticError, OverflowError, ValueError):
            cell_nonfinite += 1
            continue
        if not all(math.isfinite(value) for point in quadrilateral for value in point):
            cell_nonfinite += 1
            continue
        transformed_cells[(row, column)] = quadrilateral
    if cell_nonfinite:
        violations.append(
            f"non-finite transformed mesh cell corners in {cell_nonfinite} cells"
        )

    self_intersection_count = sum(
        _polygon_self_intersects(polygon) for polygon in transformed_cells.values()
    )
    if self_intersection_count:
        violations.append(
            f"self-intersecting transformed quadrilateral in "
            f"{self_intersection_count} mesh cells"
        )

    overlap_count = 0
    cell_items = tuple(transformed_cells.items())
    for first_index, (first_key, first_polygon) in enumerate(cell_items):
        for second_key, second_polygon in cell_items[first_index + 1 :]:
            if (
                abs(first_key[0] - second_key[0]) + abs(first_key[1] - second_key[1])
                == 1
            ):
                continue
            if _polygons_overlap(first_polygon, second_polygon):
                overlap_count += 1
    if overlap_count:
        violations.append(
            f"overlap between {overlap_count} non-neighbour mesh cell pairs"
        )

    mesh_components = _component_count(set(transformed_cells))
    if mesh_components != 1:
        violations.append(
            f"disconnected mesh coverage has {mesh_components} components"
        )

    determinant_min, determinant_max = _finite_range(determinants)
    area_min, area_max = _finite_range(finite_area_scales)
    finite_anisotropies = [value for value in anisotropies if math.isfinite(value)]
    metrics = StructuralMetrics(
        sample_count=len(usable),
        cell_count=len(transformed_cells),
        determinant_min=determinant_min,
        determinant_max=determinant_max,
        anisotropy_max=max(finite_anisotropies, default=0.0),
        area_scale_min=area_min,
        area_scale_median=median_area,
        area_scale_max=area_max,
        mesh_components=mesh_components,
        overlapping_cell_pairs=overlap_count,
    )
    return StructuralVerdict(
        passed=not violations,
        reason="PASS" if not violations else "; ".join(violations),
        sample_grid=(grid_size, grid_size),
        metrics=metrics,
    )


def coverage_components(mask: Sequence[Sequence[bool]]) -> int:
    """Count four-neighbour components in a rectangular alpha mask."""
    rows = tuple(tuple(bool(value) for value in row) for row in mask)
    if not rows:
        return 0
    width = len(rows[0])
    if any(len(row) != width for row in rows):
        raise ValueError("coverage mask must be rectangular")
    remaining = {
        (row, column)
        for row, values in enumerate(rows)
        for column, value in enumerate(values)
        if value
    }
    components = 0
    while remaining:
        components += 1
        queue = deque([remaining.pop()])
        while queue:
            row, column = queue.popleft()
            for neighbour in (
                (row - 1, column),
                (row + 1, column),
                (row, column - 1),
                (row, column + 1),
            ):
                if neighbour in remaining:
                    remaining.remove(neighbour)
                    queue.append(neighbour)
    return components


def _require_sha256(value: object, label: str) -> str:
    if not isinstance(value, str) or len(value) != _HASH_LENGTH:
        raise ValueError(f"{label} must be a 64-character SHA-256")
    try:
        int(value, 16)
    except ValueError:
        raise ValueError(f"{label} must be hexadecimal") from None
    return value.lower()


def _artifact_files(value: object, label: str) -> tuple[ArtifactFile, ...]:
    values = value if isinstance(value, list) else [value]
    if not values:
        return ()
    files: list[ArtifactFile] = []
    for index, item in enumerate(values):
        if not isinstance(item, dict):
            raise ValueError(f"{label}[{index}] must be an object")
        path = item.get("path")
        if not isinstance(path, str) or not path.strip():
            raise ValueError(f"{label}[{index}].path is required")
        files.append(
            ArtifactFile(
                path=path,
                sha256=_require_sha256(item.get("sha256"), f"{label}[{index}].sha256"),
            )
        )
    if len({file.path for file in files}) != len(files):
        raise ValueError(f"{label} contains duplicate artifact paths")
    return tuple(files)


def validate_artifact_inventory(value: object) -> ArtifactInventory:
    """Validate every required path/hash and evidence-count minimum."""
    if not isinstance(value, dict):
        raise ValueError("artifact inventory must be an object")
    if value.get("schema_version") != 1:
        raise ValueError("artifact inventory schema_version must be 1")
    observation_sha256 = _require_sha256(
        value.get("observation_sha256"), "artifact inventory observation_sha256"
    )
    raw_artifacts = value.get("artifacts")
    if not isinstance(raw_artifacts, dict):
        raise ValueError("artifact inventory artifacts must be an object")
    missing = [key for key in REQUIRED_ARTIFACTS if key not in raw_artifacts]
    if missing:
        raise ValueError(
            "artifact inventory is missing required artifact(s): " + ", ".join(missing)
        )
    unknown = sorted(
        set(raw_artifacts) - set(REQUIRED_ARTIFACTS) - set(OPTIONAL_ARTIFACTS)
    )
    if unknown:
        raise ValueError(
            "artifact inventory contains unknown artifact(s): " + ", ".join(unknown)
        )
    normalized = {
        key: _artifact_files(raw_artifacts[key], f"artifacts.{key}")
        for key in raw_artifacts
    }
    minimums = {
        "transport_control_crops": 10,
        "natural_check_crops": 6,
    }
    for key, minimum in minimums.items():
        if len(normalized[key]) < minimum:
            raise ValueError(f"{key} requires at least {minimum} artifact paths")
    for key in REQUIRED_ARTIFACTS:
        if not normalized[key]:
            raise ValueError(f"{key} requires at least one artifact path")
    return ArtifactInventory(
        observation_sha256,
        MappingProxyType(dict(sorted(normalized.items()))),
    )


def _artifact_mapping(
    value: object, label: str
) -> Mapping[str, tuple[ArtifactFile, ...]]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return MappingProxyType(
        {
            key: _artifact_files(files, f"{label}.{key}")
            for key, files in sorted(value.items())
        }
    )


def validate_visual_review(text: str, expected_observation_sha256: str) -> VisualReview:
    """Validate a hash-bound human review and its embedded artifact inventory."""
    try:
        value = json.loads(text)
    except json.JSONDecodeError as error:
        raise ValueError(f"visual review is not valid JSON: {error}") from None
    if not isinstance(value, dict):
        raise ValueError("visual review must be an object")
    if value.get("schema_version") != 1:
        raise ValueError("visual review schema_version must be 1")
    expected_hash = _require_sha256(
        expected_observation_sha256, "expected observation SHA-256"
    )
    observation_hash = _require_sha256(
        value.get("observation_sha256"), "visual review observation_sha256"
    )
    if observation_hash != expected_hash:
        raise ValueError("visual review observation SHA-256 does not match")

    gate = value.get("gate")
    if gate not in {"PASS", "FAIL"}:
        raise ValueError("visual review gate must be PASS or FAIL")
    raw_checks = value.get("checks")
    if not isinstance(raw_checks, dict):
        raise ValueError("visual review checks must be an object")
    missing_checks = [check for check in VISUAL_CHECKS if check not in raw_checks]
    extra_checks = sorted(set(raw_checks) - set(VISUAL_CHECKS))
    if missing_checks or extra_checks:
        details = []
        if missing_checks:
            details.append("missing " + ", ".join(missing_checks))
        if extra_checks:
            details.append("unknown " + ", ".join(extra_checks))
        raise ValueError("visual review checks: " + "; ".join(details))
    checks: dict[str, str] = {}
    for check in VISUAL_CHECKS:
        result = raw_checks[check]
        if result not in _REVIEW_VALUES:
            raise ValueError(f"{check} must be PASS, FAIL, or NOT_APPLICABLE")
        if result == "NOT_APPLICABLE" and check != "shared_boundary_if_applicable":
            raise ValueError(
                f"only shared_boundary_if_applicable may be NOT_APPLICABLE; got {check}"
            )
        checks[check] = result
    derived_pass = all(
        result == "PASS"
        for check, result in checks.items()
        if check != "shared_boundary_if_applicable"
    ) and checks["shared_boundary_if_applicable"] in {"PASS", "NOT_APPLICABLE"}
    if gate == "PASS" and not derived_pass:
        raise ValueError(
            "visual review claims PASS while a required check did not pass"
        )
    if gate == "FAIL" and derived_pass:
        raise ValueError(
            "visual review claims FAIL while every applicable check passes"
        )

    inventory = validate_artifact_inventory(value.get("artifact_inventory"))
    if inventory.observation_sha256 != observation_hash:
        raise ValueError("artifact inventory observation SHA-256 does not match review")
    review_artifacts = _artifact_mapping(value.get("artifacts"), "review artifacts")
    if dict(review_artifacts) != dict(inventory.artifacts):
        raise ValueError("review artifact paths/hashes do not match artifact inventory")

    raw_uses = value.get("optional_artifact_uses", {})
    if not isinstance(raw_uses, dict):
        raise ValueError("optional_artifact_uses must be an object")
    optional_uses: dict[str, str] = {}
    for key, description in raw_uses.items():
        if key not in OPTIONAL_ARTIFACTS:
            raise ValueError(f"unknown optional artifact use {key!r}")
        if not isinstance(description, str) or not description.strip():
            raise ValueError(f"{key} use must be described")
        optional_uses[key] = description
    for key in OPTIONAL_ARTIFACTS:
        if key in inventory.artifacts and key not in optional_uses:
            raise ValueError(f"{key} may appear only when its use is described")
        if key in optional_uses and key not in inventory.artifacts:
            raise ValueError(
                f"{key} is described but absent from the artifact inventory"
            )

    return VisualReview(
        gate=gate,
        observation_sha256=observation_hash,
        checks=MappingProxyType(checks),
        artifact_inventory=inventory,
        optional_artifact_uses=MappingProxyType(optional_uses),
    )


def _file_sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_object(path: pathlib.Path, label: str) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{label} must contain a JSON object")
    return value


def _selected_raster(
    selection: Mapping[str, object], selection_path: pathlib.Path
) -> pathlib.Path:
    for key in ("selected_raster_path", "raster_path", "selected_raster"):
        value = selection.get(key)
        if isinstance(value, str) and value:
            return pathlib.Path(value)
    return selection_path.parent / "selected-3857.tif"


def _rgba_from_dataset(dataset: object, maximum: int = 1600) -> object:
    # Runtime-only dependencies remain lazy so the unit suite stays stdlib-only.
    import cv2  # type: ignore[import-not-found]
    import numpy  # type: ignore[import-not-found]

    array = dataset.ReadAsArray()
    if array is None:
        raise ValueError("GDAL could not read raster pixels")
    if array.ndim == 2:
        rgb = numpy.repeat(array[:, :, None], 3, axis=2)
        alpha = numpy.full(array.shape, 255, dtype=numpy.uint8)
    else:
        bands = numpy.moveaxis(array, 0, 2)
        if bands.shape[2] >= 4:
            rgb, alpha = bands[:, :, :3], bands[:, :, 3]
        elif bands.shape[2] == 3:
            rgb = bands
            alpha = numpy.full(rgb.shape[:2], 255, dtype=numpy.uint8)
        else:
            rgb = numpy.repeat(bands[:, :, :1], 3, axis=2)
            alpha = numpy.full(rgb.shape[:2], 255, dtype=numpy.uint8)
    rgba = numpy.dstack((rgb, alpha)).astype(numpy.uint8)
    scale = min(1.0, maximum / max(rgba.shape[:2]))
    if scale < 1.0:
        rgba = cv2.resize(
            rgba,
            (round(rgba.shape[1] * scale), round(rgba.shape[0] * scale)),
            interpolation=cv2.INTER_AREA,
        )
    return rgba


def _write_png(path: pathlib.Path, image: object) -> None:
    import cv2  # type: ignore[import-not-found]

    path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(path), image):
        raise OSError(f"OpenCV could not write {path}")


def _point_fields(point: object, role: str) -> tuple[str, float, float, str]:
    identifier = str(getattr(point, "id"))
    pixel = getattr(point, "pixel")
    if pixel is None:
        raise ValueError(f"{identifier} has no frozen pixel")
    x, y = pixel
    source = getattr(point, "modern_source", None)
    if source is not None:
        layer_id = str(source["layer_id"])
        object_ids = ",".join(source["object_ids"])
        detail = f"{role} | layer {layer_id} | object {object_ids}"
    else:
        detail = f"{role} | reason {getattr(point, 'reason')}"
    return (
        identifier,
        float(x),
        float(y),
        detail,
    )


def _crop_and_label(
    dataset: object, point: object, role: str, path: pathlib.Path
) -> object:
    import cv2  # type: ignore[import-not-found]
    import numpy  # type: ignore[import-not-found]

    identifier, x, y, source_label = _point_fields(point, role)
    radius = 192
    xoff = max(0, round(x) - radius)
    yoff = max(0, round(y) - radius)
    width = min(radius * 2, dataset.RasterXSize - xoff)
    height = min(radius * 2, dataset.RasterYSize - yoff)
    array = dataset.ReadAsArray(xoff, yoff, width, height)
    if array is None:
        raise ValueError(f"could not crop {identifier}")
    if array.ndim == 2:
        image = cv2.cvtColor(array.astype(numpy.uint8), cv2.COLOR_GRAY2BGR)
    else:
        image = numpy.moveaxis(array[:3], 0, 2).astype(numpy.uint8)
        image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    label_height = 64
    labelled = cv2.copyMakeBorder(
        image, 0, label_height, 0, 0, cv2.BORDER_CONSTANT, value=(255, 255, 255)
    )
    cv2.putText(
        labelled,
        f"{identifier} | {role} | pixel ({x:.1f}, {y:.1f})",
        (8, height + 22),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (0, 0, 0),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        labelled,
        source_label,
        (8, height + 48),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.42,
        (0, 0, 0),
        1,
        cv2.LINE_AA,
    )
    _write_png(path, labelled)
    return labelled


def _contact_sheet(images: Sequence[object], path: pathlib.Path) -> None:
    import cv2  # type: ignore[import-not-found]
    import numpy  # type: ignore[import-not-found]

    if not images:
        raise ValueError("candidate contact sheet has no frozen points")
    cell_width = max(image.shape[1] for image in images)
    cell_height = max(image.shape[0] for image in images)
    columns = 4
    rows = math.ceil(len(images) / columns)
    sheet = numpy.full(
        (rows * cell_height, columns * cell_width, 3), 255, dtype=numpy.uint8
    )
    for index, image in enumerate(images):
        row, column = divmod(index, columns)
        resized = cv2.resize(image, (cell_width, cell_height))
        sheet[
            row * cell_height : (row + 1) * cell_height,
            column * cell_width : (column + 1) * cell_width,
        ] = resized
    _write_png(path, sheet)


def _residual_svg(
    payload: Mapping[str, object], title: str, path: pathlib.Path
) -> None:
    residuals = payload.get("residuals", [])
    if not isinstance(residuals, list):
        residuals = []
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">',
        '<rect width="1200" height="800" fill="white"/>',
        f'<text x="30" y="45" font-family="sans-serif" font-size="28">{title}</text>',
    ]
    for index, residual in enumerate(residuals):
        if not isinstance(residual, dict):
            continue
        start = residual.get("expected") or residual.get("source") or [0, 0]
        end = residual.get("actual") or residual.get("transformed") or start
        if not (
            isinstance(start, list)
            and isinstance(end, list)
            and len(start) >= 2
            and len(end) >= 2
        ):
            continue
        x1 = 60 + float(start[0]) % 1080
        y1 = 80 + float(start[1]) % 680
        x2 = 60 + float(end[0]) % 1080
        y2 = 80 + float(end[1]) % 680
        lines.append(
            f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" '
            'stroke="#b91c1c" stroke-width="2"/>'
        )
        lines.append(f'<circle cx="{x1:.2f}" cy="{y1:.2f}" r="3" fill="#1d4ed8"/>')
        label = str(residual.get("id", index))
        lines.append(
            f'<text x="{x2 + 4:.2f}" y="{y2 - 4:.2f}" font-family="sans-serif" '
            f'font-size="12">{label}</text>'
        )
    lines.append("</svg>")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _overlay(
    raster: object,
    preview: object,
    vector_paths: Sequence[pathlib.Path],
    colour: tuple[int, int, int],
    path: pathlib.Path,
) -> None:
    from osgeo import gdal  # type: ignore[import-not-found]
    import cv2  # type: ignore[import-not-found]
    import numpy  # type: ignore[import-not-found]

    if not vector_paths:
        raise ValueError(f"{path.stem} has no retained modern extract")
    geotransform = raster.GetGeoTransform()
    minimum_x = geotransform[0]
    maximum_y = geotransform[3]
    maximum_x = minimum_x + geotransform[1] * raster.RasterXSize
    minimum_y = maximum_y + geotransform[5] * raster.RasterYSize
    mask = numpy.zeros(preview.shape[:2], dtype=numpy.uint8)
    for vector_path in vector_paths:
        burned = gdal.Rasterize(
            "",
            str(vector_path),
            format="MEM",
            outputBounds=(minimum_x, minimum_y, maximum_x, maximum_y),
            width=preview.shape[1],
            height=preview.shape[0],
            outputSRS=raster.GetProjection(),
            burnValues=[255],
        )
        if burned is None:
            raise ValueError(f"could not rasterize retained extract {vector_path}")
        values = burned.ReadAsArray()
        mask = numpy.maximum(mask, values.astype(numpy.uint8))
    result = preview[:, :, :3].copy()
    expanded = cv2.dilate(mask, numpy.ones((3, 3), numpy.uint8))
    result[expanded > 0] = colour
    _write_png(path, result)


def _resolve_extracts(
    points: Sequence[object], reference: pathlib.Path
) -> tuple[pathlib.Path, ...]:
    paths: list[pathlib.Path] = []
    for point in points:
        source = getattr(point, "modern_source")
        recorded = pathlib.Path(str(source["local_extract_path"]))
        candidates = (reference / recorded, reference / recorded.name)
        resolved = next(
            (candidate for candidate in candidates if candidate.exists()), None
        )
        if resolved is None:
            raise FileNotFoundError(
                f"retained modern extract for {getattr(point, 'id')} is absent: {recorded}"
            )
        if resolved not in paths:
            paths.append(resolved)
    return tuple(paths)


def _tile_sample(raster: object, zoom: int, path: pathlib.Path) -> None:
    from osgeo import gdal  # type: ignore[import-not-found]

    if raster.GetProjection() and "3857" not in raster.GetProjection():
        projected = gdal.Warp(
            "", raster, format="MEM", dstSRS="EPSG:3857", dstAlpha=True
        )
    else:
        projected = raster
    geotransform = projected.GetGeoTransform()
    center_x = geotransform[0] + geotransform[1] * projected.RasterXSize / 2
    center_y = geotransform[3] + geotransform[5] * projected.RasterYSize / 2
    world = 20037508.342789244
    tile_span = 2 * world / (2**zoom)
    tile_x = math.floor((center_x + world) / tile_span)
    tile_y = math.floor((world - center_y) / tile_span)
    minimum_x = -world + tile_x * tile_span
    maximum_x = minimum_x + tile_span
    maximum_y = world - tile_y * tile_span
    minimum_y = maximum_y - tile_span
    sample = gdal.Warp(
        "",
        projected,
        format="MEM",
        dstSRS="EPSG:3857",
        outputBounds=(minimum_x, minimum_y, maximum_x, maximum_y),
        width=256,
        height=256,
        dstAlpha=True,
        resampleAlg="bilinear",
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    translated = gdal.Translate(str(path), sample, format="PNG")
    if translated is None:
        raise ValueError(f"could not render QA-only zoom {zoom} sample tile")


def _inventory_entry(
    paths: Sequence[pathlib.Path], root: pathlib.Path
) -> list[dict[str, str]]:
    return [
        {
            "path": path.relative_to(root).as_posix(),
            "sha256": _file_sha256(path),
        }
        for path in paths
    ]


def render_qa(
    source: pathlib.Path,
    observation_path: pathlib.Path,
    selection_path: pathlib.Path,
    natural_checks_path: pathlib.Path,
    reference: pathlib.Path,
    output: pathlib.Path,
) -> pathlib.Path:
    """Render and hash the complete QA-only evidence package."""
    from osgeo import gdal  # type: ignore[import-not-found]
    import cv2  # type: ignore[import-not-found]
    import numpy  # type: ignore[import-not-found]

    from tools.fletcher.physical_observation import load_observation, verify_source

    observation_bytes = observation_path.read_bytes()
    observation_sha256 = hashlib.sha256(observation_bytes).hexdigest()
    observation = load_observation(observation_path)
    selection = _json_object(selection_path, "selection")
    natural = _json_object(natural_checks_path, "natural checks")
    for label, payload in (("selection", selection), ("natural checks", natural)):
        recorded_hash = payload.get("observation_sha256")
        if recorded_hash != observation_sha256:
            raise ValueError(f"{label} observation SHA-256 does not match")

    forbidden = pathlib.Path("tiles") / "sheet-24-modern-v1"
    if forbidden.as_posix() in output.as_posix():
        raise ValueError(
            "render output must be the QA directory, not deliverable tiles"
        )
    output.mkdir(parents=True, exist_ok=True)
    source_dataset = gdal.Open(str(source), gdal.GA_ReadOnly)
    if source_dataset is None:
        raise ValueError(f"GDAL could not open source scan {source}")
    verify_source(
        observation.source_receipt,
        source,
        lambda _: (source_dataset.RasterXSize, source_dataset.RasterYSize),
    )
    raster_path = _selected_raster(selection, selection_path)
    raster = gdal.Open(str(raster_path), gdal.GA_ReadOnly)
    if raster is None:
        raise ValueError(f"GDAL could not open selected raster {raster_path}")

    crop_root = output / "crops"
    transport_paths: list[pathlib.Path] = []
    natural_paths: list[pathlib.Path] = []
    contact_images: list[object] = []
    for role, points, paths in (
        ("control", observation.controls, transport_paths),
        ("check", observation.final_checks, natural_paths),
    ):
        for point in points:
            path = crop_root / role / f"{point.id}.png"
            contact_images.append(_crop_and_label(source_dataset, point, role, path))
            paths.append(path)
    for candidate in observation.rejected_candidates:
        if candidate.pixel is None:
            continue
        path = crop_root / "rejected" / f"{candidate.id}.png"
        contact_images.append(
            _crop_and_label(source_dataset, candidate, "rejected", path)
        )
    contact_path = output / "candidate-contact-sheet.png"
    _contact_sheet(contact_images, contact_path)

    transport_svg = output / "transport-residual-vectors.svg"
    natural_svg = output / "natural-residual-vectors.svg"
    residual_payload = selection.get("selected_candidate")
    _residual_svg(
        residual_payload if isinstance(residual_payload, dict) else selection,
        "Transport leave-one-out residuals",
        transport_svg,
    )
    _residual_svg(natural, "Natural final-check residuals", natural_svg)

    preview = _rgba_from_dataset(raster)
    preview_path = output / "warped-preview.png"
    _write_png(preview_path, cv2.cvtColor(preview, cv2.COLOR_RGBA2BGRA))
    alpha = preview[:, :, 3]
    components = coverage_components((alpha > 0).tolist())
    if components != 1:
        raise ValueError(f"selected raster alpha coverage has {components} components")
    alpha_image = numpy.where(alpha > 0, 255, 0).astype(numpy.uint8)
    alpha_path = output / "alpha-coverage.png"
    _write_png(alpha_path, alpha_image)

    transport_overlay = output / "transportation-overlay.png"
    hydrography_overlay = output / "hydrography-overlay.png"
    _overlay(
        raster,
        preview,
        _resolve_extracts(observation.controls, reference),
        (220, 38, 38),
        transport_overlay,
    )
    _overlay(
        raster,
        preview,
        _resolve_extracts(observation.final_checks, reference),
        (37, 99, 235),
        hydrography_overlay,
    )

    tile_paths: dict[int, pathlib.Path] = {}
    for zoom in (8, 12, 16):
        path = output / "qa-only-tiles" / f"z{zoom}" / "sample.png"
        _tile_sample(raster, zoom, path)
        tile_paths[zoom] = path

    artifact_paths: dict[str, Sequence[pathlib.Path]] = {
        "candidate_contact_sheet": [contact_path],
        "transport_control_crops": transport_paths,
        "natural_check_crops": natural_paths,
        "transport_residual_vectors": [transport_svg],
        "natural_residual_vectors": [natural_svg],
        "warped_preview": [preview_path],
        "transportation_overlay": [transport_overlay],
        "hydrography_overlay": [hydrography_overlay],
        "alpha_coverage": [alpha_path],
        "tile_sample_z8": [tile_paths[8]],
        "tile_sample_z12": [tile_paths[12]],
        "tile_sample_z16": [tile_paths[16]],
    }
    inventory_payload = {
        "schema_version": 1,
        "observation_sha256": observation_sha256,
        "artifacts": {
            key: _inventory_entry(paths, output)
            for key, paths in artifact_paths.items()
        },
    }
    validate_artifact_inventory(inventory_payload)
    inventory_path = output / "artifact-inventory.json"
    inventory_path.write_text(
        json.dumps(inventory_payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return inventory_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest="command", required=True)
    render = subparsers.add_parser("render", help="render hash-bound QA-only evidence")
    render.add_argument("--source", type=pathlib.Path, required=True)
    render.add_argument("--observation", type=pathlib.Path, required=True)
    render.add_argument("--selection", type=pathlib.Path, required=True)
    render.add_argument("--natural-checks", type=pathlib.Path, required=True)
    render.add_argument("--reference", type=pathlib.Path, required=True)
    render.add_argument("--output", type=pathlib.Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "render":
        inventory = render_qa(
            args.source,
            args.observation,
            args.selection,
            args.natural_checks,
            args.reference,
            args.output,
        )
        print(inventory)
        return 0
    raise ValueError(f"unknown command {args.command!r}")


if __name__ == "__main__":
    raise SystemExit(main())
