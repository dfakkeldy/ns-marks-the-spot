"""Pure decision logic for the resumable Fletcher batch."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AccuracyVerdict:
    passed: bool
    reason: str


@dataclass(frozen=True)
class AccuracyGate:
    rms_limit_m: float = 400.0
    p95_limit_m: float = 900.0
    max_limit_m: float = 1500.0

    def evaluate(
        self,
        *,
        control_count: int,
        check_count: int,
        rms_m: float | None,
        p95_m: float | None,
        max_m: float | None,
    ) -> AccuracyVerdict:
        if check_count == 0 or rms_m is None or p95_m is None or max_m is None:
            return AccuracyVerdict(False, "no held-out check points")
        failures: list[str] = []
        if rms_m > self.rms_limit_m:
            failures.append(f"RMS {rms_m:.1f} m > {self.rms_limit_m:g} m")
        if p95_m > self.p95_limit_m:
            failures.append(f"P95 {p95_m:.1f} m > {self.p95_limit_m:g} m")
        if max_m > self.max_limit_m:
            failures.append(f"max {max_m:.1f} m > {self.max_limit_m:g} m")
        return AccuracyVerdict(not failures, "; ".join(failures))


@dataclass(frozen=True)
class CandidateAccuracy:
    method: str
    control_count: int
    check_count: int
    rms_m: float | None
    p95_m: float | None
    max_m: float | None


def choose_best_candidate(candidates: list[CandidateAccuracy]) -> CandidateAccuracy:
    checked = [
        candidate
        for candidate in candidates
        if candidate.check_count > 0 and candidate.rms_m is not None
    ]
    if not checked:
        raise ValueError("cannot select a transform without held-out accuracy")
    return min(checked, key=lambda candidate: candidate.rms_m)


def resumable_sheet_ids(
    ordered_sheet_ids: list[str],
    manifest: dict[str, dict],
) -> list[str]:
    """Keep original priority order and skip only fully tiled sheets."""
    return [
        sheet_id
        for sheet_id in ordered_sheet_ids
        if manifest.get(sheet_id, {}).get("stage") != "tiled"
    ]
