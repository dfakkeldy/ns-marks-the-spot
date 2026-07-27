"""Feature-led v2 result receipts and the committed report table.

Each `record` invocation writes one committed receipt under
`tools/fletcher/results/sheet-<NN>-feature-v2.json` and then rewrites only the
marked "Feature-led v2 registrations" section of `reports/fletcher/RESULTS.md`
from every committed receipt on disk. This module never touches the
engraved-grid content rendered by `tools.fletcher.report` - it only ever
replaces the byte range strictly between `MARK_START` and `MARK_END`, or
appends a new marked section when neither marker is present yet.

A receipt's `observation_sha256` is always the sha256 of the observation
file's bytes at record time (via `tools.fletcher.fetch.sha256`), never a hash
of the parsed/re-serialized dict - so the receipt can later prove exactly
which on-disk observation it was recorded against.
"""

from __future__ import annotations

import argparse
import json
import pathlib

from tools.fletcher.fetch import sha256
from tools.fletcher.feature_observation import ACCEPTED, METHOD_VERSION, load_observation

MARK_START = "<!-- feature-led-v2:start -->"
MARK_END = "<!-- feature-led-v2:end -->"

PASS = "PASS"
FAIL = "FAIL"
BLOCKED = "blocked"
DISPOSITIONS = (PASS, FAIL, BLOCKED)

_MISSING = "—"  # —

_HEADER = (
    "| Sheet | Disposition | Controls | Checks | RMS m | P95 m | Max m | "
    "Regions | Reason |\n"
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
)

_PREAMBLE = (
    "These rows measure feature-led v2 alignment to modern NSTDB features at\n"
    "frozen held-out checks; they do not alter the engraved-grid diagnostics "
    "above."
)


def _metric(value: object) -> str:
    if value is None:
        return _MISSING
    return f"{float(value):.1f}"


def _sort_key(result: dict) -> tuple[int, object]:
    """Numeric sheet ids sort numerically; anything else falls back to text."""
    sheet_id = result.get("sheet_id")
    try:
        return (0, int(str(sheet_id)))
    except (TypeError, ValueError):
        return (1, str(sheet_id))


def render_feature_table(results: list[dict]) -> str:
    """Markdown table of feature-led v2 receipts, one row per result.

    Rows are sorted by sheet id. Metrics (RMS/P95/Max/Regions) come from a
    `PASS` receipt's `score` dict, rounded to 1 decimal; any non-`PASS`
    disposition renders `—` for every metric column regardless of
    whether a `score` happens to be present, since only an accepted result
    is reported as a measured alignment.
    """
    rows: list[str] = []
    for result in sorted(results, key=_sort_key):
        disposition = str(result.get("disposition", _MISSING))
        score = result.get("score") if disposition == PASS else None
        overall = score.get("overall") if isinstance(score, dict) else None
        regions = score.get("regions") if isinstance(score, dict) else None
        reason = str(result.get("reason", "")).replace("|", "\\|")
        rows.append(
            "| "
            + " | ".join(
                [
                    str(result.get("sheet_id", _MISSING)),
                    disposition,
                    str(result.get("control_count", _MISSING)),
                    str(result.get("check_count", _MISSING)),
                    _metric((overall or {}).get("rms_m")),
                    _metric((overall or {}).get("p95_m")),
                    _metric((overall or {}).get("max_m")),
                    str(len(regions)) if isinstance(regions, dict) else _MISSING,
                    reason,
                ]
            )
            + " |"
        )
    return "\n".join([_HEADER, *rows])


def update_results_md(text: str, table: str) -> str:
    """Replace or append the marked feature-led v2 section in `text`.

    If both `MARK_START` and `MARK_END` are present, only the byte range
    strictly between them is replaced (with a newline + `table` + newline) -
    every byte before `MARK_START` and from `MARK_END` onward, including the
    markers themselves, is preserved exactly. If neither marker is present,
    a new `## Feature-led v2 registrations` section (with a preamble and the
    markers) is appended after the existing text, which itself is left
    byte-identical. Applying this twice with the same `table` is a no-op the
    second time.
    """
    has_start = MARK_START in text
    has_end = MARK_END in text
    if has_start != has_end:
        raise ValueError("results markdown has an unmatched feature-led v2 marker")

    if has_start:
        start = text.index(MARK_START) + len(MARK_START)
        end = text.index(MARK_END, start)
        return text[:start] + "\n" + table + "\n" + text[end:]

    section = (
        "\n## Feature-led v2 registrations\n\n"
        + _PREAMBLE
        + "\n"
        + MARK_START
        + "\n"
        + table
        + "\n"
        + MARK_END
        + "\n"
    )
    return text + section


def _accepted_control_count(obs: dict) -> int:
    return sum(
        1
        for point in obs.get("controls", ())
        if (point.get("review") or {}).get("status") == ACCEPTED
    )


def _accepted_check_count(obs: dict) -> int:
    return sum(
        1
        for point in obs.get("final_checks", ())
        if (point.get("review") or {}).get("status") == ACCEPTED
    )


def build_receipt(
    obs: dict,
    score: dict | None,
    disposition: str,
    reason: str,
    observation_sha256_value: str,
    recorded_at: str,
) -> dict:
    """Assemble one committed feature-led v2 receipt dict.

    `control_count`/`check_count` prefer the `score` dict's own counts (the
    fit/scoring stage already computed those precisely); when `score` is
    `None` (a non-`PASS` disposition recorded before scoring completed) they
    fall back to counting accepted points directly on the observation.
    """
    if disposition not in DISPOSITIONS:
        raise ValueError(f"disposition must be one of {DISPOSITIONS}, got {disposition!r}")

    if score is not None:
        control_count = score.get("control_count", _accepted_control_count(obs))
        check_count = len(score.get("per_check", {}))
    else:
        control_count = _accepted_control_count(obs)
        check_count = _accepted_check_count(obs)

    return {
        "sheet_id": obs["sheet_id"],
        "method_version": obs.get("method_version", METHOD_VERSION),
        "disposition": disposition,
        "reason": reason,
        "observation_sha256": observation_sha256_value,
        "control_count": control_count,
        "check_count": check_count,
        "score": score,
        "recorded_at": recorded_at,
    }


def _load_receipts(results_dir: pathlib.Path) -> list[dict]:
    receipts = []
    for path in sorted(results_dir.glob("sheet-*-feature-v2.json")):
        receipts.append(json.loads(path.read_text(encoding="utf-8")))
    return receipts


def record(
    *,
    observation: pathlib.Path,
    score_path: pathlib.Path | None,
    disposition: str,
    reason: str,
    recorded_at: str,
    out: pathlib.Path,
    results_md: pathlib.Path,
) -> dict:
    """Write one receipt, then rewrite `results_md`'s marker section from all
    committed receipts on disk (siblings of `out`)."""
    obs = load_observation(observation)
    score = (
        json.loads(score_path.read_text(encoding="utf-8")) if score_path is not None else None
    )
    receipt = build_receipt(
        obs,
        score,
        disposition,
        reason,
        sha256(observation),
        recorded_at,
    )

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    receipts = _load_receipts(out.parent)
    table = render_feature_table(receipts)
    existing_text = results_md.read_text(encoding="utf-8") if results_md.exists() else ""
    results_md.parent.mkdir(parents=True, exist_ok=True)
    results_md.write_text(update_results_md(existing_text, table), encoding="utf-8")

    return receipt


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest="command", required=True)
    record_sub = subparsers.add_parser("record")
    record_sub.add_argument("--observation", type=pathlib.Path, required=True)
    record_sub.add_argument("--score", type=pathlib.Path, default=None)
    record_sub.add_argument("--disposition", required=True, choices=DISPOSITIONS)
    record_sub.add_argument("--reason", required=True)
    record_sub.add_argument("--recorded-at", required=True)
    record_sub.add_argument("--out", type=pathlib.Path, required=True)
    record_sub.add_argument("--results-md", type=pathlib.Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == "record":
        receipt = record(
            observation=args.observation,
            score_path=args.score,
            disposition=args.disposition,
            reason=args.reason,
            recorded_at=args.recorded_at,
            out=args.out,
            results_md=args.results_md,
        )
        print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
