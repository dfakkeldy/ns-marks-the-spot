"""Render the committed Fletcher outcome report from the compute manifest."""

from __future__ import annotations

import argparse
import json
import pathlib


def _metric(value: object) -> str:
    if value is None:
        return "—"
    return f"{float(value):.1f}"


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
    return f"""# Hugh Fletcher independent georeferencing results

Run date: 2026-07-25

## Outcome

The inventory identified 24 separate `Atlas Map` sheets and excluded the two
catalog composites from georeferencing. The batch produced {pass_count}
held-out PASS result(s) and {tiled_count} tiled sheet(s). Every sheet has an
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

| Sheet | Stage | Method | Controls | Checks | RMS m | P95 m | Max m | Gate | PNG tiles | Reason |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
{chr(10).join(rows)}

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
coordinate frame. They do not establish historical feature accuracy, current
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
2. Review the retained warped-preview images and a representative sample of
   XYZ tiles for every PASS sheet before any publication decision.
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
