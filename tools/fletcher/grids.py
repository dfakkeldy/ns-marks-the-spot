"""Human-reviewed Fletcher graticules and explicit rejection dispositions."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CoordinateLine:
    pixel: float | None
    coordinate: float
    label: str


@dataclass(frozen=True)
class MeasuredIntersection:
    meridian_index: int
    parallel_index: int
    pixel_x: float
    pixel_y: float


@dataclass(frozen=True)
class ReviewedGrid:
    meridians: tuple[CoordinateLine, ...]
    parallels: tuple[CoordinateLine, ...]
    qa_note: str
    intersections: tuple[MeasuredIntersection, ...] = ()
    checks: tuple[tuple[int, int], ...] = ()


def _meridians(
    pixels: tuple[float, ...],
    degree: int,
    first_minute: int,
) -> tuple[CoordinateLine, ...]:
    first_total = degree * 60 + first_minute
    return tuple(
        CoordinateLine(
            pixel,
            -(first_total - index * 5) / 60,
            (
                f"{(first_total - index * 5) // 60}d"
                f"{(first_total - index * 5) % 60:02d}mW"
            ),
        )
        for index, pixel in enumerate(pixels)
    )


def _parallels(
    pixels: tuple[float, ...],
    degree: int,
    first_minute: int,
) -> tuple[CoordinateLine, ...]:
    first_total = degree * 60 + first_minute
    return tuple(
        CoordinateLine(
            pixel,
            (first_total - index * 5) / 60,
            (
                f"{(first_total - index * 5) // 60}d"
                f"{(first_total - index * 5) % 60:02d}mN"
            ),
        )
        for index, pixel in enumerate(pixels)
    )


REVIEWED_GRIDS = {
    4: ReviewedGrid(
        _meridians((2307, 4117, 5914, 7732), 60, 25),
        _parallels((2328, 4947), 46, 45),
        "Four interior meridians and two interior parallels visibly cross; "
        "the right neatline was excluded.",
    ),
    7: ReviewedGrid(
        _meridians((2458, 4262, 6060, 7867), 60, 25),
        _parallels((2156, 4770), 46, 35),
        "Four interior meridians and two labelled parallels visibly cross; "
        "the right neatline was excluded.",
    ),
    12: ReviewedGrid(
        _meridians((1746, 3563, 5333, 7180, 8980), 60, 50),
        _parallels((1430, 4026), 46, 15),
        "All ten detected intersections were visibly printed graticule rules.",
    ),
    14: ReviewedGrid(
        _meridians((1770, 3582, 5401, 7221, 9016), 61, 35),
        _parallels((1684, 4302), 46, 15),
        "All ten detected intersections were visibly printed graticule rules.",
    ),
    17: ReviewedGrid(
        _meridians((1796, 3624, 5456, 7282, 9092), 60, 50),
        _parallels((1266, 3874), 45, 55),
        "Representative pilot: all ten intersections inspected at full detail.",
    ),
    18: ReviewedGrid(
        _meridians((2635, 4474, 6302, 8120), 61, 10),
        _parallels((1137, 3837, 6591), 45, 55),
        "Four labelled meridians and three labelled parallels, including "
        "coordinate-labelled boundary rules, were visibly confirmed.",
    ),
    19: ReviewedGrid(
        _meridians((1652, 3472, 5289, 7130, 8958), 61, 35),
        _parallels((1326, 3950, 6566), 45, 55),
        "Five labelled meridians and three labelled parallels were confirmed.",
    ),
    20: ReviewedGrid(
        _meridians((1656, 3500, 5302, 7154, 8976), 60, 50),
        _parallels((1108, 3740, 6344), 45, 55),
        "Five labelled meridians and three labelled parallels were confirmed.",
    ),
    21: ReviewedGrid(
        _meridians((2674, 4473, 6291, 8136), 61, 10),
        _parallels((3736, 6292), 45, 40),
        "Four interior meridians and two labelled parallels visibly cross; "
        "the right neatline was excluded.",
    ),
    22: ReviewedGrid(
        _meridians((1688, 3496, 5321, 7134, 8946), 61, 35),
        _parallels((1732, 4336), 45, 40),
        "All ten detected intersections were visibly printed graticule rules.",
    ),
    23: ReviewedGrid(
        (
            CoordinateLine(None, -61 - 10 / 60, "61d10mW"),
            CoordinateLine(None, -61 - 5 / 60, "61d05mW"),
            CoordinateLine(None, -61, "61d00mW"),
            CoordinateLine(None, -60 - 55 / 60, "60d55mW"),
        ),
        (
            CoordinateLine(None, 45 + 30 / 60, "45d30mN"),
            CoordinateLine(None, 45 + 25 / 60, "45d25mN"),
        ),
        (
            "Four engraved meridian labels and two engraved parallel labels "
            "were independently readable. Individual intersection pixels "
            "retain the scan's slant instead of flattening it. Detector "
            "candidates near x=6173 and x=8011 were true meridians; candidates "
            "near x=1371/1476 and x=9650/9760 were borders or neatlines, and "
            "x=5336 was a linen fold. Horizontal candidates near y=1001/1115 "
            "and y=6589/6718 were borders or neatlines. Linen folds near the "
            "true rules, lithology hatching, shoreline or survey boundaries, "
            "text strokes and decorative rules were excluded."
        ),
        (
            MeasuredIntersection(0, 0, 2_539.0, 3_505.0),
            MeasuredIntersection(1, 0, 4_359.0, 3_529.0),
            MeasuredIntersection(2, 0, 6_178.0, 3_545.0),
            MeasuredIntersection(3, 0, 8_008.0, 3_557.0),
            MeasuredIntersection(0, 1, 2_492.0, 6_127.0),
            MeasuredIntersection(1, 1, 4_322.0, 6_155.0),
            MeasuredIntersection(2, 1, 6_143.0, 6_176.0),
            MeasuredIntersection(3, 1, 7_987.0, 6_197.0),
        ),
        ((0, 0), (3, 1)),
    ),
}


REJECTED_GRIDS = {
    1: "automatic graticule detection found no reviewable regular sequence",
    2: "automatic graticule detection found no reviewable regular sequence",
    3: "QA found a fold and one labelled boundary, not two independent parallels",
    5: "QA found a fold and one labelled boundary, not two independent parallels",
    6: "automatic graticule detection found no reviewable regular sequence",
    8: "QA found a fold and one labelled boundary, not two independent parallels",
    9: "automatic graticule detection found no reviewable regular sequence",
    10: "automatic graticule detection found no reviewable regular sequence",
    11: "QA found one false horizontal and one boundary, not two parallels",
    13: "QA found map boundaries and a fold, not independent parallels",
    15: "QA found map boundaries and a fold, not independent parallels",
    16: "QA rejected a regular sequence formed by a fold and lithology hatching",
    24: "automatic graticule detection found no reviewable regular sequence",
}


def check_intersections(
    meridian_count: int,
    parallel_count: int,
) -> list[tuple[int, int]]:
    point_count = meridian_count * parallel_count
    target_count = min(
        point_count - 6,
        max(2, point_count // 3),
    )
    if target_count < 2:
        raise ValueError("grid cannot leave six controls and two checks")
    flat_indexes = [
        round((index + 0.5) * point_count / target_count - 0.5)
        for index in range(target_count)
    ]
    return [
        (flat_index // parallel_count, flat_index % parallel_count)
        for flat_index in flat_indexes
    ]
