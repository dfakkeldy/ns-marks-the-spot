"""Detect the long, regular engraved graticule rules in a Fletcher scan."""

from __future__ import annotations

import argparse
import json
import pathlib


def cluster_candidates(
    candidates: list[tuple[float, float]],
    *,
    tolerance: float,
) -> list[tuple[float, float]]:
    """Collapse duplicate Hough lines, retaining a strength-weighted position."""
    clusters: list[list[tuple[float, float]]] = []
    for candidate in sorted(candidates):
        if not clusters or candidate[0] - clusters[-1][-1][0] > tolerance:
            clusters.append([candidate])
        else:
            clusters[-1].append(candidate)
    result: list[tuple[float, float]] = []
    for cluster in clusters:
        total_strength = sum(strength for _, strength in cluster)
        position = (
            sum(position * strength for position, strength in cluster)
            / total_strength
        )
        result.append((position, max(strength for _, strength in cluster)))
    return result


def select_regular_positions(
    candidates: list[tuple[float, float]],
    *,
    expected_spacing: float,
    spacing_tolerance: float,
    position_tolerance: float,
    minimum_count: int,
) -> list[float]:
    """Choose the longest approximately arithmetic candidate sequence."""
    ordered = sorted(candidates)
    best: tuple[tuple[int, float, float], list[float]] | None = None
    for first_index, (first_position, first_strength) in enumerate(ordered):
        for second_position, second_strength in ordered[first_index + 1 :]:
            spacing = second_position - first_position
            if abs(spacing - expected_spacing) > spacing_tolerance:
                continue
            positions = [first_position, second_position]
            strength = first_strength + second_strength
            deviation = 0.0
            expected = second_position + spacing
            while expected <= ordered[-1][0] + position_tolerance:
                unused = [
                    candidate
                    for candidate in ordered
                    if candidate[0] > positions[-1]
                    and abs(candidate[0] - expected) <= position_tolerance
                ]
                if not unused:
                    break
                position, candidate_strength = min(
                    unused,
                    key=lambda candidate: abs(candidate[0] - expected),
                )
                positions.append(position)
                strength += candidate_strength
                deviation += abs(position - expected)
                expected = first_position + len(positions) * spacing
            score = (len(positions), strength, -deviation)
            if best is None or score > best[0]:
                best = (score, positions)
    if best is None or len(best[1]) < minimum_count:
        raise ValueError(
            f"no regular sequence of at least {minimum_count} lines"
        )
    return best[1]


def detect(source: pathlib.Path, scale: float = 0.25) -> dict:
    import cv2
    import numpy as np

    image = cv2.imread(str(source), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError(f"could not read {source}")
    reduced = cv2.resize(image, None, fx=scale, fy=scale)
    height, width = reduced.shape
    edges = cv2.Canny(reduced, 50, 120)
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 1800,
        threshold=250,
        minLineLength=min(width, height) // 2,
        maxLineGap=80,
    )
    if lines is None:
        raise ValueError("Hough transform found no long rules")

    vertical: list[tuple[float, float]] = []
    horizontal: list[tuple[float, float]] = []
    for raw_line in lines[:, 0]:
        x1, y1, x2, y2 = (int(value) for value in raw_line)
        delta_x = abs(x2 - x1)
        delta_y = abs(y2 - y1)
        if delta_y > height * 0.50 and delta_x < 20:
            vertical.append(((x1 + x2) / 2, float(delta_y)))
        if delta_x > width * 0.50 and delta_y < 20:
            horizontal.append(((y1 + y2) / 2, float(delta_x)))

    vertical = [
        candidate
        for candidate in cluster_candidates(vertical, tolerance=8)
        if width * 0.08 < candidate[0] < width * 0.94
    ]
    horizontal = [
        candidate
        for candidate in cluster_candidates(horizontal, tolerance=8)
        if height * 0.08 < candidate[0] < height * 0.94
    ]
    meridians = select_regular_positions(
        vertical,
        expected_spacing=width * (1826 / 10873),
        spacing_tolerance=width * 0.008,
        position_tolerance=18,
        minimum_count=4,
    )
    parallels = select_regular_positions(
        horizontal,
        expected_spacing=height * (2608 / 7642),
        spacing_tolerance=height * 0.015,
        position_tolerance=18,
        minimum_count=2,
    )
    return {
        "source": str(source),
        "scale": scale,
        "meridians": [round(position / scale, 1) for position in meridians],
        "parallels": [round(position / scale, 1) for position in parallels],
        "vertical_candidates": [
            [round(position / scale, 1), round(strength / scale, 1)]
            for position, strength in vertical
        ],
        "horizontal_candidates": [
            [round(position / scale, 1), round(strength / scale, 1)]
            for position, strength in horizontal
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    result = detect(args.source)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
