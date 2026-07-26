"""Render the committed Fletcher outcome report from the compute manifest."""

from __future__ import annotations

import argparse
import json
import pathlib


def _metric(value: object) -> str:
    if value is None:
        return "—"
    return f"{float(value):.1f}"


def _modern_metrics(
    fields: dict,
    fixture_key: str,
    result_key: str,
) -> dict:
    """Read modern metrics without consulting graticule result fields."""
    metrics = fields.get(fixture_key)
    if not isinstance(metrics, dict):
        metrics = fields.get(result_key)
    return metrics if isinstance(metrics, dict) else {}


def _modern_gate(fields: dict, nested_key: str, flat_key: str) -> str:
    """Read one modern gate in either finalized or fixture form."""
    nested = fields.get(nested_key)
    if isinstance(nested, dict) and nested.get("gate") is not None:
        return str(nested["gate"])
    return str(fields.get(flat_key, "—"))


def render_modern_pilots(manifest: dict) -> str:
    """Render only versioned modern-feature pilot results from the manifest."""
    rows: list[str] = []
    sheets = manifest.get("sheets", {})
    if not isinstance(sheets, dict):
        return ""
    for sheet_id, sheet_fields in sorted(sheets.items(), key=lambda item: int(item[0])):
        if not isinstance(sheet_fields, dict):
            continue
        fields = sheet_fields.get("modern_feature_v1")
        if not isinstance(fields, dict):
            continue
        transport = _modern_metrics(fields, "transport", "selected_candidate")
        natural = _modern_metrics(fields, "natural", "natural_metrics")
        reason = str(fields.get("reason", "")).replace("|", "\\|")
        rows.append(
            "| "
            + " | ".join(
                [
                    sheet_id,
                    str(fields.get("method_version", "—")),
                    str(fields.get("disposition", "—")),
                    str(fields.get("selected_method", "—")),
                    str(transport.get("count", transport.get("point_count", "—"))),
                    "/".join(
                        _metric(transport.get(metric))
                        for metric in ("rms_m", "p95_m", "max_m")
                    ),
                    str(natural.get("count", natural.get("point_count", "—"))),
                    "/".join(
                        _metric(natural.get(metric))
                        for metric in ("rms_m", "p95_m", "max_m")
                    ),
                    _modern_gate(fields, "structural", "structural_gate"),
                    _modern_gate(fields, "visual_qa", "visual_stage"),
                    str(fields.get("tile_png_count", "—")),
                    reason,
                ]
            )
            + " |"
        )
    if not rows:
        return ""
    return f"""
## Modern-feature pilots

These versioned pilots are independent of the engraved-grid result above.
Transport leave-one-out metrics select the transform family; natural checks are
the primary published accuracy estimate.

| Sheet | Method version | Disposition | Selected transform | Transport n | Transport RMS/P95/max m | Natural n | Natural RMS/P95/max m | Structural gate | Visual QA | PNG tiles | Reason |
| ---: | --- | --- | --- | ---: | --- | ---: | --- | --- | --- | ---: | --- |
{chr(10).join(rows)}
"""


def render_results(
    manifest: dict,
    *,
    sheet_numbers: list[int] | None = None,
) -> str:
    if sheet_numbers is None:
        sheet_numbers = list(range(1, 25))
    sheets = manifest["sheets"]
    rows: list[str] = []
    pass_count = 0
    tiled_count = 0
    for number in sheet_numbers:
        fields = sheets.get(str(number), {})
        gate = str(fields.get("gate", "FAIL"))
        if gate == "PASS":
            pass_count += 1
        if fields.get("stage") == "tiled":
            tiled_count += 1
        reason = str(fields.get("gate_reason") or fields.get("reason") or "")
        if gate == "PASS" and not reason:
            reason = "held-out thresholds satisfied"
        elif gate != "PASS" and not reason:
            reason = (
                f"{fields.get('stage', 'missing')} without a held-out result"
            )
        reason = reason.replace("|", "\\|")
        rows.append(
            "| "
            + " | ".join(
                [
                    f"{number:02d}",
                    str(fields.get("stage", "missing")),
                    str(fields.get("selected_method", "—")),
                    str(fields.get("control_count", "—")),
                    str(fields.get("check_count", "—")),
                    _metric(fields.get("check_rms_m")),
                    _metric(fields.get("check_p95_m")),
                    _metric(fields.get("check_max_m")),
                    gate,
                    str(fields.get("tile_png_count", "—")),
                    reason,
                ]
            )
            + " |"
        )

    pilot = sheets.get("17", {})
    return f"""# Hugh Fletcher engraved-grid registration diagnostics

Run date: 2026-07-25

## Outcome

`PASS` in this report is a lattice-fit diagnostic, not product geographic
acceptance. It measures sparse checks against the historical sheet's own
engraved coordinate frame. It must not be used to claim that roads, shorelines,
rivers, neighbouring-sheet seams or modern map features align within the
reported residual.

The inventory identified 24 separate `Atlas Map` sheets and excluded the two
catalog composites from georeferencing. The batch produced {pass_count}
held-out lattice PASS result(s) and {tiled_count} tiled sheet(s). Every sheet has an
explicit disposition below; a failed or missing lattice is not reported as
georeferenced.

Sheet 17 was the representative pilot. Its selected
`{pilot.get("selected_method", "—")}` warp scored
RMS {_metric(pilot.get("check_rms_m"))} m,
P95 {_metric(pilot.get("check_p95_m"))} m and
maximum {_metric(pilot.get("check_max_m"))} m on
{pilot.get("check_count", "—")} held-out intersections, then produced
{pilot.get("tile_png_count", "—")} PNG tiles.

The fixed gate was RMS <= 400 m, P95 <= 900 m and maximum <= 1,500 m.
Candidate transforms were compared by held-out RMS; held-out points were never
included in their candidate's fit.
For series comparability, the same held-out set was used both to compare
candidate transform families and to report the selected transform. This is a
methodological limitation: the reported held-out metrics are not from a second,
untouched model-selection test set.

| Sheet | Stage | Method | Controls | Checks | RMS m | P95 m | Max m | Lattice gate | PNG tiles | Reason |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
{chr(10).join(rows)}
{render_modern_pilots(manifest)}

## Method and provenance

- Inventory and source/rights evidence:
  [INVENTORY.md](INVENTORY.md).
- Full-resolution sheets came from the David Rumsey IIIF service. Requests were
  serialized, cached by Rumsey item, delayed by at least 0.5 seconds between
  missing regions, and retried with exponential backoff.
- The compute run used `/var/home/dan/nsmarks-fletcher-20260725` on Bazzite in
  the `nsmarks-gis` distrobox. Its atomic `manifest.json` retains per-sheet
  source checksums, stages, metrics, QA paths and tile counts.
- Long regular rules were first sought in each full-resolution scan, then
  reviewed in labelled anchor crops and per-intersection contact sheets.
  Where that fixed-axis detector was inadequate, independently readable
  engraved labels and individually measured intersections retained scan
  slant. Folds, map neatlines, borders, lithology hatching, boundaries, text
  strokes and decorative rules were rejected when they were not labelled
  graticule rules.
- Reviewed observations were split into disjoint control and check
  intersections before affine, second-order polynomial and TPS candidates were
  evaluated. A sheet that could not support at least six controls plus held-out
  checks remained FAIL.
- Tiling used Web Mercator XYZ PNGs for zooms 8 through 16. Tiles, scans,
  GeoTIFFs and QA images remain compute artifacts and are not committed.

These metrics measure registration to the map's own engraved geographic
coordinate frame. They do not establish historical or modern feature
alignment, neighbouring-sheet seam quality, human map acceptance, current
parcel alignment, title, access, value, permissions, flood or service
feasibility.

## Rights and publication boundary

On 2026-07-25, Cartography Associates replied to the request titled
“Permission to georeference Hugh Fletcher maps for a free Nova Scotia web map”:
“Hello, your use is permitted without charge. See link below for details on use
and how to download images.” The reply linked the
[David Rumsey copyright and permissions page](https://www.davidrumsey.com/about/copyright-and-permissions).

This is written permission for the direct-Rumsey georeferencing use described
for the free Nova Scotia web map. That use retains the credit “David Rumsey Map
Collection, David Rumsey Map Center, Stanford University Libraries,” the linked
[CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) terms,
non-commercial use, attribution, identification of this project's
georeferencing and other changes, and ShareAlike treatment where applicable.
The repository's MIT licence covers software, not the map imagery.

The reply does not clear OldMapsOnline-derived tiles, warps or control points;
unrelated paid uses; standalone facsimile sales; materially different future
distribution; or native offline bundling unless that use is separately
supported by the original request and written response.

No tile host was configured. No service URL, web layer or iOS layer was
changed.

## What next

1. For failed sheets, make targeted full-resolution manual observations or use
   independently sourced physical-feature controls and disjoint checks. Do not
   infer coordinates from the successful sheets or from the old warp.
2. Numerically validate untouched real-world features, edge distortion and
   neighbouring-sheet seams, then obtain human overlay acceptance at useful
   zooms before any publication decision. A lattice PASS is not sufficient.
3. Apply the scoped direct-Rumsey permission and linked terms only to the free
   Nova Scotia web-map use described in the request; keep every excluded use
   separately gated.
4. If a later run improves a failed sheet, retain the old failure reason and
   source checksum in the manifest/report history rather than replacing it
   with an unqualified success claim.
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("manifest", type=pathlib.Path)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render_results(manifest), encoding="utf-8")
    print(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
