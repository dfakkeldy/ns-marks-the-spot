"""Human-reviewed Fletcher graticules and explicit rejection dispositions."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CoordinateLine:
    pixel: float
    coordinate: float
    label: str


@dataclass(frozen=True)
class ReviewedGrid:
    meridians: tuple[CoordinateLine, ...]
    parallels: tuple[CoordinateLine, ...]
    qa_note: str


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
    23: "automatic graticule detection found no reviewable regular sequence",
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
