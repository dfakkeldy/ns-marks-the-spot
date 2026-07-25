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
        reason = str(fields.get("reason") or "")
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
- Long regular rules were detected from each full-resolution scan, then
  reviewed in labelled anchor crops and per-intersection contact sheets.
  Folds, map neatlines and lithology hatching were rejected when they did not
  form a coordinate-labelled graticule.
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

The live Rumsey permissions page allows attributed reproduction for personal
use or publication and links CC BY-NC-SA 3.0, while leaving users responsible
for other restrictions. This run therefore preserves the product's existing
`rights-pending` gate. It does not turn that catalog/permissions finding into
clearance for tile hosting, web enablement, native bundling or repository
distribution.

No tile host was configured. No service URL, web layer or iOS layer was
changed.

## What next

1. For failed sheets, make targeted full-resolution manual observations or use
   independently sourced physical-feature controls and disjoint checks. Do not
   infer coordinates from the successful sheets or from the old warp.
2. Review the retained warped-preview images and a representative sample of
   XYZ tiles for every PASS sheet before any publication decision.
3. Resolve written hosting and product-distribution rights separately. Keep
   the layer disabled until that gate is explicitly cleared.
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
