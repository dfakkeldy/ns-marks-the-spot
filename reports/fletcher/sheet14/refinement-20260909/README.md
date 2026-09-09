# Sheet 14 refinement — 9 September 2026

The active revision uses **25 controls** over the complete sheet. It corrects
Frasers Brook's modern confluence (C09) and adds three audited junctions in
White/Cove Brook and upper Frasers Brook. The original 22-control fit and tiles
remain available. **Hay River and the Mabou join remain unresolved.**

## Editable files and source frame

- [fit.json](fit.json): 25 fitting controls, TPS in EPSG:3857.
- [checks.json](checks.json): ten diagnostic observations, excluded from this fit.
- [sheet-14-controls.csv](sheet-14-controls.csv): controls-only import.
- [sheet-14-review.csv](sheet-14-review.csv): combined controls/checks import with roles preserved.
- [sheet-14-checks.csv](sheet-14-checks.csv): inspection/interchange only; the app rejects a checks-only import.

Use a separate draft of the **native `sheet14.png`, 10852 × 7622**, with image-edge
pixel coordinates. Its SHA-256 is
`907ebc260018055cfc9da780a88f127db13834c0f7e831be7bf395c600a6854c`.
Never attach these pixel controls to the resampled GeoTIFF. The original
[full neatline](../boundary.json), source imagery and all other sheets are unchanged.

Local raster:
`~/Downloads/fletcher-sheet14/refinement-20260909/result25/sheet-14-full-sheet.tif`.
[Render receipt](render-receipt.json) records its hash, dimensions, extent and
5 projected-metre cells. Pixel size is not positional accuracy.

## What changed and how it was checked

C09's source pixel stays at (8303, 3360). Named NSTDB Frasers Brook features
264089 → 121396 → 263938 → 263940 → 263939 lead from the upper forks to **J0182**,
where the tributary meets Broad Cove River features 261081/261082. The previous
J0174 is a different unnamed western tributary, about 300 m north. J0185 is
another unnamed tributary and is also wrong for this source feature. F03 was
rechecked against the named MacIsaacs Brook network and retained.

R01–R03 have native crosshair and modern-context [review figures](review/).
Their source coordinates were adjusted to visible ink before the candidate was
fitted. [Frame records](review/frames.json) retain crop extents and source positions.
The NSTDB extracts are unchanged; see the [reference receipt](../reference-receipts.json).

A new diagnostic T01 initially confused the main-stem junction J0248 with the
fork J0252 farther east on its tributary. Direct endpoint and river-name tracing
resolved the order: northwestern Stewarts Brook feature 315723 continues south
as 277457; eastern tributary 195795 joins at J0248. The historical source has
that northwest/south/east connectivity. Its native pixel did not change.
The [correction record](check-correction.json) and the
[pre-correction inputs and scores](candidate26/checks-before-check-audit.json)
retain the error. This correction happened after scoring, so it is diagnostic,
not fresh validation.

| Same diagnostic observations | Previous 22 controls | Active 25 controls |
| --- | ---: | ---: |
| All ten: median / worst ground m | 114 / 377 | **89 / 376** |
| Original nine, excluding the failed Hay River trial: median / worst | 108 / 216 | 65 / 168 |
| Upper Frasers Brook T03 | 216 | 48 |
| Cove main-stem T01 | 108 | 49 |
| Lower Cove Brook T02 | 92 | 50 |
| MacIsaacs Brook loop T04 | 119 | 116 |
| Upper White Brook F07 | 82 | 114 |
| Hay River R04 | 377 | 376 |

[Baseline scores](baseline-scores.json) and [active scores](scores.json) replay
identical locations. These are targeted, same-agent diagnostic observations,
including a previously fitted trial point, not independent validation of the
whole sheet. The 200 m worst-error working target is still missed. Improvement
is uneven; MacIsaacs Brook's large loop and eastern Cove tributaries still show
visible offsets. Do not describe the sheet as geographically accepted.

## Rejected Hay River fit and a stronger rendering check

R04 is a provisional northern tributary/bank junction near Hay River. Its
historical ink is partly obscured by road and railway detail. Adding it as a
26th TPS control makes the local warp nearly singular. A 25 px orientation grid
reported no reversals; a subsequent 1 px audit found determinants approaching
zero. Yet the **actual raster had 78,496 transparent interior cells** and severe
local distortion. Good fitting residuals and negative sampled determinants did
not establish a usable raster.

The [26-control candidate](candidate26/fit.json), [scores](candidate26/scores.json),
[failed imagery](candidate26/warped-review/hay-river.jpg),
[orientation audit](candidate26/orientation-detail.json), and
[failed coverage check](candidate26/coverage-verification.json) are retained.
Its CSVs are historical trial records; use the active CSVs above for import.
R04 is excluded from the active fit and retained as an explicitly failed
model-diagnostic observation. It must not be silently added back to make its
residual zero. The native/modern definition and surrounding bank matches need
further investigation before selecting a usable local transform.

The new [coverage verifier](verify_raster_coverage.py) rasterizes the full neatline
independently and tests alpha inside a one-output-cell boundary inset. It rejects
the failed candidate and verifies **48,547,810 interior cells with zero holes**
in the active raster. This checks coverage, not geography. The active 25 px
orientation audit has 70,997 samples, no reversed samples, and determinant range
−34.81 to −17.66.

[Actual before/after warped imagery](warped-review/) overlays unchanged NSTDB
water and roads in EPSG:3857. These figures use raster geographic windows, not
an inverse search guide. Roads can have changed and provide context only.
The GDAL TPS implementation refines an inverse-transform estimate; this is a
separate rendering path from the forward point scores. See the
[GDAL 3.9.3 implementation](https://github.com/OSGeo/gdal/blob/v3.9.3/alg/gdal_tps.cpp).
The observed failure is reproduced by the coverage test; no GDAL source patch
or alternative unvalidated inverse solver was introduced.

## Join, preview and next work

The Mabou join remains approximately **333–761 m open** over longitudes
−61.46° through −61.24°. [Coverage measurements](mabou-join.json) include wider
edge samples; far-east spikes intersect staggered side edges and are not ordinary
join widths. This is coverage separation, not measured feature error. No edge
stretch or synthetic content closes the gap.

The new immutable local preview is `fletcher-full-sheets-20260909.1`; it includes
this refinement plus the unchanged Judique, Mabou and Hawkesbury rasters. The
[full-sheet report](../../full-sheets/README.md) records tile verification and
browser checks. Nothing is deployed or merged by this refinement task.

[Importer verification](import-verification.json) checks all 25 controls and ten
check roles, CSV round trips, and web/GDAL forward-transform agreement to below
0.001 projected metres. That numerical agreement is not a browser mesh or
geographic accuracy test.

Continue by resolving the Hay River north-bank definition and adjacent southern
tributaries, then audit physical stream continuity across Sheet 14 and Mabou 16.
Preserve the current fit while working. The user chose physical boundary matching
and full sheets, not cosmetic closure or a corridor crop.

## Delivery verification

- Full tile pyramid: 4,792 PNG objects at zooms 8–15; all inventory hashes pass.
- 203,036,001 opaque zoom-15 cells match the continuous reference resample exactly, including tile edges.
- Browser: nine map views plus desktop/mobile, toggle, opacity and reload; all 196 tile responses succeeded, with no console errors.
- Web build and 39 focused preview/import tests pass.
- [Preservation receipt](preservation.json): other sheets unchanged; 21 prior Sheet 14 controls unchanged, C09 source pixel unchanged.
- [Digitization handoff](handoff-receipt.json): `~/Downloads/fletcher-sheet14/digitization-handoff-20260909/`.

The tile ZIP is about 431 MB; its [archive receipt](tile-archive-receipt.json) includes SHA-256 and a verified CRC scan.
