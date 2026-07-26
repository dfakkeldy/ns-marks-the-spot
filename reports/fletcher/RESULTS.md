# Hugh Fletcher engraved-grid registration diagnostics

Run date: 2026-07-25
Final 13-sheet completion: 2026-07-26

## Outcome

> **Product alignment rejected 2026-07-26.** A live comparison measured a
> visible feature displacement of approximately 636 m. The current warps
> require a feature-led do-over and must not be uploaded or republished.

`PASS` in this report is a lattice-fit diagnostic, not product geographic
acceptance. It measures sparse checks against the historical sheet's own
engraved coordinate frame. It must not be used to claim that roads, shorelines,
rivers, neighbouring-sheet seams or modern map features align within the
reported residual.

The inventory identified 24 separate `Atlas Map` sheets and excluded the two
catalog composites from georeferencing. The batch produced 24
held-out lattice PASS result(s) and 24 tiled sheet(s). Every sheet has an
explicit disposition below; a failed or missing lattice is not reported as
georeferenced.

Sheet 17 was the representative pilot. Its selected
`tps` warp scored
RMS 9.4 m,
P95 16.3 m and
maximum 16.3 m on
4 held-out intersections, then produced
8080 PNG tiles.

The fixed gate was RMS <= 400 m, P95 <= 900 m and maximum <= 1,500 m.
Candidate transforms were compared by held-out RMS; held-out points were never
included in their candidate's fit.
For series comparability, the same held-out set was used both to compare
candidate transform families and to report the selected transform. This is a
methodological limitation: the reported held-out metrics are not from a second,
untouched model-selection test set.

| Sheet | Stage | Method | Controls | Checks | RMS m | P95 m | Max m | Lattice gate | PNG tiles | Reason |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| 01 | tiled | affine | 6 | 2 | 43.8 | 59.3 | 59.3 | PASS | 4447 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 02 | tiled | affine | 6 | 2 | 11.4 | 15.1 | 15.1 | PASS | 4339 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 03 | tiled | affine | 6 | 2 | 12.0 | 12.5 | 12.5 | PASS | 4415 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 04 | tiled | tps | 6 | 2 | 22.4 | 23.2 | 23.2 | PASS | 7886 | held-out thresholds satisfied |
| 05 | tiled | affine | 6 | 2 | 4.0 | 4.3 | 4.3 | PASS | 4274 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 06 | tiled | affine | 6 | 2 | 24.7 | 34.2 | 34.2 | PASS | 4468 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 07 | tiled | tps | 6 | 2 | 9.8 | 9.8 | 9.8 | PASS | 8224 | held-out thresholds satisfied |
| 08 | tiled | affine | 8 | 2 | 14.9 | 17.0 | 17.0 | PASS | 4312 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 09 | tiled | affine | 6 | 2 | 56.4 | 68.0 | 68.0 | PASS | 4216 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 10 | tiled | affine | 8 | 2 | 20.9 | 25.5 | 25.5 | PASS | 4293 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 11 | tiled | affine | 6 | 2 | 60.8 | 65.1 | 65.1 | PASS | 4370 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 12 | tiled | tps | 7 | 3 | 77.0 | 118.3 | 118.3 | PASS | 8222 | held-out thresholds satisfied |
| 13 | tiled | affine | 6 | 2 | 26.6 | 29.7 | 29.7 | PASS | 4303 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 14 | tiled | tps | 7 | 3 | 21.2 | 34.9 | 34.9 | PASS | 8082 | held-out thresholds satisfied |
| 15 | tiled | affine | 6 | 2 | 10.3 | 11.1 | 11.1 | PASS | 4180 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 16 | tiled | affine | 8 | 2 | 155.0 | 216.0 | 216.0 | PASS | 4343 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |
| 17 | tiled | tps | 6 | 4 | 9.4 | 16.3 | 16.3 | PASS | 8080 | held-out thresholds satisfied |
| 18 | tiled | tps | 8 | 4 | 99.0 | 99.1 | 99.1 | PASS | 7777 | held-out thresholds satisfied |
| 19 | tiled | tps | 10 | 5 | 11.5 | 15.2 | 15.2 | PASS | 7786 | held-out thresholds satisfied |
| 20 | tiled | tps | 10 | 5 | 49.3 | 60.7 | 60.7 | PASS | 8015 | held-out thresholds satisfied |
| 21 | tiled | tps | 6 | 2 | 33.8 | 45.8 | 45.8 | PASS | 8098 | held-out thresholds satisfied |
| 22 | tiled | affine | 7 | 3 | 13.4 | 15.3 | 15.3 | PASS | 8016 | held-out thresholds satisfied |
| 23 | tiled | tps | 6 | 2 | 51.0 | 69.2 | 69.2 | PASS | 7834 | held-out thresholds satisfied; visual QA accepted |
| 24 | tiled | affine | 8 | 2 | 41.2 | 49.5 | 49.5 | PASS | 4193 | held-out thresholds satisfied; official NSTDB transport, hydrography and shoreline visual QA accepted |

## Modern-feature pilots

These versioned pilots are independent of the engraved-grid result above.
Transport leave-one-out metrics select the transform family; natural checks are
the primary published accuracy estimate. The Sheet 24 source-drift row is
retained as historical evidence from the earlier pilot and is superseded for
alignment purposes by Sheet 24's independent affine PASS in the main results
table.

| Sheet | Method version | Disposition | Selected transform | Transport n | Transport RMS/P95/max m | Natural n | Natural RMS/P95/max m | Structural gate | Visual QA | PNG tiles | Reason |
| ---: | --- | --- | --- | ---: | --- | ---: | --- | --- | --- | ---: | --- |
| 24 | modern-feature-v1 | source-drift | — | — | —/—/— | — | —/—/— | — | not-run | 0 | source-drift: invalid Sheet 24 manifest receipt: manifest.sheets.24.list_number must be a non-empty string |


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

1. Do not resume the full upload or republish the current warps.
2. Start a separately approved, feature-led pilot on one representative sheet.
   Use dense, spatially distributed controls and untouched validation features
   across shorelines, rivers, lakes, roads and other stable features.
3. Numerically validate edge distortion and neighbouring-sheet seams, then
   obtain human overlay acceptance at useful zooms before tiling or uploading
   the remaining sheets. A lattice PASS is not sufficient.
4. Preserve each sheet's retained observations, checksums, warped-preview
   images, official-source overlays and representative XYZ tile QA as
   diagnostic history rather than accepted geography.
5. Apply the scoped direct-Rumsey permission and linked terms only to the free
   Nova Scotia web-map use described in the request; keep every excluded use
   separately gated.
6. If a later run improves an alignment, retain the superseded result, source
   checksum and reason in the manifest/report history rather than replacing it
   with an unqualified success claim.
