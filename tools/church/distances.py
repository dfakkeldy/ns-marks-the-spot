"""Summarise a field of shoreline-to-ink distances.

`shoreline_error.py` measures, for every modern shoreline pixel falling inside
a warped panel, how far it is to the nearest historical ink. That is a LOWER
BOUND on shoreline error - any ink counts, so dense hachure or lettering near a
coast flatters it - but it is reproducible and it covers the whole panel
instead of a handful of hand-picked spots.

It is deliberately NOT the accuracy figure. Held-out physical check points are
(see `residuals.py`). This is a dense, cheap second opinion whose real value is
its SPATIAL breakdown: a warp that has failed in one corner shows up as one bad
band while the rest of the panel looks fine, and an aggregate would hide that.

The statistics live here so a report can be recomputed, and its percentile
convention argued with, without a GDAL host.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

__all__ = ["BandSummary", "DistanceSummary", "percentile", "summarise_distances"]


def percentile(sorted_values: list[float], q: float) -> float:
    """Linearly-interpolated percentile over an already-sorted list.

    Matches numpy's default `linear` method, so figures computed here stay
    comparable with the ones the 2026-07-24 measurement runs reported.
    """
    if not sorted_values:
        raise ValueError("no values to take a percentile of")
    if not 0.0 <= q <= 100.0:
        raise ValueError(f"percentile must be within 0..100, got {q}")
    if len(sorted_values) == 1:
        return sorted_values[0]

    position = (q / 100.0) * (len(sorted_values) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    weight = position - lower
    return sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight


@dataclass(frozen=True)
class BandSummary:
    """One horizontal slice of the panel, top to bottom."""

    band: int
    samples: int
    rms_m: float | None

    def as_dict(self) -> dict:
        return {"band": self.band, "samples": self.samples, "rms_m": self.rms_m}


@dataclass(frozen=True)
class DistanceSummary:
    """Distribution of shoreline-to-ink distance across one panel."""

    samples: int
    median_m: float
    mean_m: float
    rms_m: float
    p90_m: float
    p95_m: float
    p99_m: float
    max_m: float
    within_250m_pct: float
    within_500m_pct: float
    bands: tuple[BandSummary, ...]

    def as_dict(self) -> dict:
        return {
            "samples": self.samples,
            "median_m": self.median_m,
            "mean_m": self.mean_m,
            "rms_m": self.rms_m,
            "p90_m": self.p90_m,
            "p95_m": self.p95_m,
            "p99_m": self.p99_m,
            "max_m": self.max_m,
            "within_250m_pct": self.within_250m_pct,
            "within_500m_pct": self.within_500m_pct,
            "bands": [band.as_dict() for band in self.bands],
        }


def summarise_distances(
    distances_m: list[float], band_of: list[int] | None = None, band_count: int = 4
) -> DistanceSummary:
    """Aggregate a distance field, optionally split into spatial bands.

    `band_of[i]` is the band index of sample `i`. Bands with no samples report
    `rms_m = None` rather than 0.0 - an empty band is a gap in coverage, and
    reporting it as a perfect score would be a lie in exactly the direction
    that flatters the result.
    """
    if not distances_m:
        raise ValueError("no shoreline samples inside the panel")
    if band_of is not None and len(band_of) != len(distances_m):
        raise ValueError(
            f"got {len(distances_m)} distances but {len(band_of)} band labels"
        )
    if band_count < 1:
        raise ValueError(f"band_count must be at least 1, got {band_count}")

    count = float(len(distances_m))
    ordered = sorted(distances_m)

    bands: list[BandSummary] = []
    for band in range(band_count):
        if band_of is None:
            selected: list[float] = []
        else:
            selected = [d for d, b in zip(distances_m, band_of) if b == band]
        bands.append(
            BandSummary(
                band=band,
                samples=len(selected),
                rms_m=_rms(selected) if selected else None,
            )
        )

    return DistanceSummary(
        samples=len(distances_m),
        median_m=percentile(ordered, 50.0),
        mean_m=sum(distances_m) / count,
        rms_m=_rms(distances_m),
        p90_m=percentile(ordered, 90.0),
        p95_m=percentile(ordered, 95.0),
        p99_m=percentile(ordered, 99.0),
        max_m=ordered[-1],
        within_250m_pct=100.0 * sum(1 for d in distances_m if d <= 250.0) / count,
        within_500m_pct=100.0 * sum(1 for d in distances_m if d <= 500.0) / count,
        bands=tuple(bands),
    )


def _rms(values: list[float]) -> float:
    return math.sqrt(sum(value * value for value in values) / len(values))
