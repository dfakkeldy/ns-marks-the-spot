# Mabou northern boundary audit — 9 September 2026

The selected provisional revision is [candidate36/fit.json](candidate36/fit.json): **36 controls, including all 32 unchanged hand controls**, and [14 excluded diagnostic checks](candidate36/checks.json). The complete Sheet 16 neatline is retained. This improves the Glendyer channel near Mabou's northern edge; it does not establish a seamless or uniformly accurate sheet.

## Matches and trials

Three northern features were reserved and crosshair-reviewed before scoring the unchanged 34-control fit:

| Check | Physical feature | Baseline error, ground m | Final role |
| --- | --- | ---: | --- |
| N01 | Glendyer Brook: eastern tributary at the weaving mill, just south of the diagonal bridge | 262 | Added control |
| N02 | Elgin Brook upper fork: northern arm meets the east–west main before its long southward reach | 139 | Excluded check, now 151 m |
| N03 | Glendyer Brook: eastern tributary at the broad S bend above the tannery and estuary mouth | 142 | Added control |

[Native/modern paired figures](review/) show the exact source pixels and NSTDB junctions. [Frames](review/frames.json) record crop coordinates. Existing hand points were not moved or reclassified. Their initial unreviewed status is not silently promoted to a new user audit.

The 35-control trial added N01 alone. It moved the separately identified N03 from 142 to 208 m and worsened an estuary check; that trial was not adopted. Root-level `fit.json`, `fit-checks.json` and `revised-scores.json` preserve it. Adding N03 as a second control produces the selected 36-control revision. Both consumed observations are excluded from final accuracy statistics; their former check-review text records their original selection stage.

## Evidence and tradeoffs

The same final 14 excluded locations score **106 m median / 139 m worst** on the prior fit, versus **107 m / 151 m** on the selected fit. This is a local physical alignment improvement, not an aggregate diagnostic accuracy gain. N02 changes from 139 to 151 m; estuary Q03 from 50 to 75 m and Q07 from 133 to 147 m. The 100 m median target is still missed. Checks used during these comparisons are now diagnostic, not fresh validation.

[Actual warped-raster comparisons](warped-review/) show the Glendyer main and long eastern mill tributary aligning more closely with modern channels. Estuary and Elgin comparisons retain the visible limitations. The source scan, full crop and other sheets are unchanged. The modern coordinate references are the existing provincial NSTDB extracts; their [query receipts](../../sheet16/reference-receipts.json) remain authoritative. Names and nearby roads corroborate identity; inverse/affine guide predictions are not observations.

[Coverage verification](candidate36/coverage.json) found no alpha holes in 44,632,729 interior cells. [Render receipt](candidate36/render-receipt.json) records raster identity and orientation samples. These are rendering checks, not survey validation. [Control preservation](candidate36/preservation.json) confirms exact equality of all 34 previous point records, including 32 hand controls.

## Boundary and delivery

Across longitude -61.46° to -61.24°, the [Sheet 14–Mabou gap](candidate36/northern-join.json) is approximately **86–959 ground metres**. Wider samples near the staggered eastern side edges reach larger values; do not report those as ordinary join width. The [Mabou–Judique boundary](candidate36/southern-join.json) continues to overlap throughout that same interval, by roughly 121–350 m. These are coverage distances, not feature errors or proof of missing original survey content. No edge stretching or content filling was used.

- [Native controls CSV](candidate36/sheet-16-controls.csv): fitting rows only.
- [Combined review CSV](candidate36/sheet-16-review.csv): import into a separate native-scan NSMtS draft, select TPS, and retain check roles. Import replaces that draft's control list.
- [Import verification](candidate36/import-verification.json): parser roundtrip and web/GDAL solver consistency. Do not apply native control coordinates to the already warped GeoTIFF.

Native scan: `~/Downloads/fletcher-sheet16/native/sheet16.png`, 10822 × 7531.
Selected raster: `~/Downloads/mabou-north-audit-20260909/result36/sheet-16-full-sheet.tif`.
Dated handoff: `~/Downloads/mabou-north-audit-20260909/digitization-handoff/`.
Four-sheet tile revision: `fletcher-full-sheets-20260909.3`. Sheet 14, Judique and Hawkesbury raster inputs remain unchanged; previous revisions and handoffs are preserved.

For digitized labels, recompute geography from saved native pixel positions using the new fit, and record its hash. Keep pixel coordinates so later revisions remain reversible. The next useful geographic work is additional independent Glendyer/Elgin checks and physical matching in the still-open Sheet 14 join.

CI detected the downstream label projector still pinned to the old Mabou fit.
The pipeline now pins each sheet explicitly, and the [256 Mabou annotations](../../label-geography/sheet-16-labels.geojson)
have been reprojected from unchanged source boxes: 292 supported anchors and
five retained neatline holdbacks. The updated handoff includes this GeoJSON.
These are lettering locations, not accepted physical feature placements.
