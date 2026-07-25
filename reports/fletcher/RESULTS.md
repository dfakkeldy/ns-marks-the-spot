# Hugh Fletcher independent georeferencing results

Run date: 2026-07-25

## Outcome

The inventory identified 24 separate `Atlas Map` sheets and excluded the two
catalog composites from georeferencing. The batch produced 10
held-out PASS result(s) and 10 tiled sheet(s). Every sheet has an
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

| Sheet | Stage | Method | Controls | Checks | RMS m | P95 m | Max m | Gate | PNG tiles | Reason |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| 01 | failed | — | — | — | — | — | — | FAIL | — | automatic graticule detection found no reviewable regular sequence |
| 02 | failed | — | — | — | — | — | — | FAIL | — | automatic graticule detection found no reviewable regular sequence |
| 03 | failed | — | — | — | — | — | — | FAIL | — | QA found a fold and one labelled boundary, not two independent parallels |
| 04 | tiled | tps | 6 | 2 | 22.4 | 23.2 | 23.2 | PASS | 7886 | held-out thresholds satisfied |
| 05 | failed | — | — | — | — | — | — | FAIL | — | QA found a fold and one labelled boundary, not two independent parallels |
| 06 | failed | — | — | — | — | — | — | FAIL | — | automatic graticule detection found no reviewable regular sequence |
| 07 | tiled | tps | 6 | 2 | 9.8 | 9.8 | 9.8 | PASS | 8224 | held-out thresholds satisfied |
| 08 | failed | — | — | — | — | — | — | FAIL | — | QA found a fold and one labelled boundary, not two independent parallels |
| 09 | failed | — | — | — | — | — | — | FAIL | — | automatic graticule detection found no reviewable regular sequence |
| 10 | failed | — | — | — | — | — | — | FAIL | — | automatic graticule detection found no reviewable regular sequence |
| 11 | failed | — | — | — | — | — | — | FAIL | — | QA found one false horizontal and one boundary, not two parallels |
| 12 | tiled | tps | 7 | 3 | 77.0 | 118.3 | 118.3 | PASS | 8222 | held-out thresholds satisfied |
| 13 | failed | — | — | — | — | — | — | FAIL | — | QA found map boundaries and a fold, not independent parallels |
| 14 | tiled | tps | 7 | 3 | 21.2 | 34.9 | 34.9 | PASS | 8082 | held-out thresholds satisfied |
| 15 | failed | — | — | — | — | — | — | FAIL | — | QA found map boundaries and a fold, not independent parallels |
| 16 | failed | — | — | — | — | — | — | FAIL | — | QA rejected a regular sequence formed by a fold and lithology hatching |
| 17 | tiled | tps | 6 | 4 | 9.4 | 16.3 | 16.3 | PASS | 8080 | held-out thresholds satisfied |
| 18 | tiled | tps | 8 | 4 | 99.0 | 99.1 | 99.1 | PASS | 7777 | held-out thresholds satisfied |
| 19 | tiled | tps | 10 | 5 | 11.5 | 15.2 | 15.2 | PASS | 7786 | held-out thresholds satisfied |
| 20 | tiled | tps | 10 | 5 | 49.3 | 60.7 | 60.7 | PASS | 8015 | held-out thresholds satisfied |
| 21 | tiled | tps | 6 | 2 | 33.8 | 45.8 | 45.8 | PASS | 8098 | held-out thresholds satisfied |
| 22 | tiled | affine | 7 | 3 | 13.4 | 15.3 | 15.3 | PASS | 8016 | held-out thresholds satisfied |
| 23 | failed | — | — | — | — | — | — | FAIL | — | automatic graticule detection found no reviewable regular sequence |
| 24 | failed | — | — | — | — | — | — | FAIL | — | automatic graticule detection found no reviewable regular sequence |

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
