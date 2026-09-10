# Sheet 14 southern and Hay River audit — 9 September 2026

The selected provisional transform is [hay-topology/fit.json](hay-topology/fit.json): **26 controls, 13 excluded diagnostic checks**, complete native neatline. It supersedes the previous 25-control refinement. Root-level fit/check files preserve the intermediate southern-only trial; they are not the active handoff. The earlier rejected 26-control trial that fitted R04 is also separate and remains rejected.

## What changed

- C13 retains native pixel (6375, 6411) but now matches J0573, the northwestern tributary of Northeast Mabou River. The old J0593 is the next downstream junction and receives a tributary from the east. [Network paths](network-paths.json) record how the existing C17 catchment connects through the mill to this junction.
- B01 adds the mill confluence at (6738, 5889), J0544. Its old-fit displacement was 401 m; it is now fitted and does not count as a successful independent check. B02, the upstream fork, remains excluded and scores 191 m on the selected fit.
- C14 is MacKinnons Brook entering Hays River, J0563, not the short swamp drain J0558. F05 is MacKays Brook joining the Hays main, J0578, not MacKinnons. Earlier interpretation mistook the southward Hays main for a tributary. Native pixels of both controls are unchanged.
- R04 is Schoolhouse Brook, J0571. The farther-eastern northern tributary is H01/J0550. R04 remains excluded from fitting. The former interpretation in [hay-review.json](hay-review.json) is explicitly superseded.

The [NRCan Lake Ainslie map](https://ftp.maps.canada.ca/pub/nrcan_rncan/raster/topographic/50k/011/k/03/011k03_0400_canmatrix_geotiff.zip) is edition 4, published 1998 with information current 1994, as read from its margin. It clarifies the named drainage and roads; NSTDB supplies the coordinates. It does not prove that every channel remained unchanged since Fletcher. [Receipt and reference crops](hay-topology/reference-receipt.json) preserve this distinction. The oval historical feature on MacKinnons is context only, not a control.

## Evidence and limits

The key procedural correction was to trace the Hays main and its entire tributary sequence before judging proximity. A single plausible fork and an inverse-fit search location had reinforced the wrong identity. The dated reference and road context exposed that error; forcing the disputed check into the old control set only distorted the raster.

[Selected diagnostics](hay-topology/scores.json): median **112 m**, worst **241 m** over 13 points excluded from the fit. The working 100 m median/200 m worst targets remain unmet. These are same-agent observations; several have been used during earlier reviews. H01/H02 were reserved before this trial, then became diagnostics. H02's native pixel was corrected after scoring from (9257, 6262) to (9264, 6266) because the paired figure showed its crosshair west of the visible intersection. Before-audit files preserve that result; the fit and raster did not change.

With the corrected identities and identical final 13-check set, the intermediate southern-only fit scored 114 m median/1,138 m worst, versus 112 m/241 m after the Hay correction. R04 scores 80 m, H01 scores 241 m and H02 scores 123 m. Do not compare the old 376 m R04 score directly with 80 m: its modern identity changed. [Baseline scores](hay-topology/baseline-scores.json) replay the corrected check locations on the prior transform.

[Paired native/modern figures](hay-topology/review/) and [actual raster overlays](hay-topology/warped-review/) support the decision. The southern-only [C13/B01/B02 audits](review/) remain applicable; their pixels and identities are unchanged by the Hay trial. The overlay still shows shape offsets, especially toward the eastern edge. Full-sheet geographic acceptance is not claimed.

The raster is EPSG:3857, 5 projected-metre cells, 8724 × 5734. [Coverage verification](hay-topology/coverage-verification.json) tests 47,338,856 interior cells with zero alpha holes. All 70,997 sampled orientation determinants retain the expected sign. These test rendering health, not geographic accuracy.

## Crop, joins and delivery

The full inner neatline and native source are unchanged. No corridor clipping, forced seam adjustment or content filling was applied. The Mabou join remains open by approximately 113–1,013 ground metres across -61.46° to -61.24°; see [sampled join separation](hay-topology/mabou-join.json). Separation is coverage distance, not point accuracy or proof that the original survey omitted the strip.

Active editable files: [controls CSV](hay-topology/sheet-14-controls.csv), [combined review CSV](hay-topology/sheet-14-review.csv), [checks](hay-topology/checks.json). Import native pixels into a separate native-scan draft and use TPS. Keep checks excluded. Do not apply native coordinates to the resampled GeoTIFF.

Local raster: `~/Downloads/fletcher-sheet14/hay-boundary-audit/hay-result/sheet-14-full-sheet.tif`.
Local handoff: `~/Downloads/fletcher-sheet14/digitization-handoff-southern-20260909/`.
Tiles: `fletcher-full-sheets-20260909.2`, four complete sheets, unchanged Judique/Mabou/Hawkesbury inputs and 64 preserved hand controls. Previous rasters, tile revisions and handoffs remain available.
