# Sheet 9 — first whole-sheet trial

The current draft has **16 physical controls and five excluded diagnostics**.
It covers the complete printed inner neatline, including the offshore area.
It is **not accepted for production tiles or label projection**. Sheet11 and
the existing four-sheet tiles are unchanged. `../status.json` is canonical.

The editable inputs are `draft-fit.json`, `draft-checks.json`, and the two
`sheet-09-draft-*.csv` files. CSV pixels refer to the original **10762 × 7642**
scan, not the cropped raster. Source and modern-reference provenance remain in
`../source-receipt.json` and `../reference-receipts.json`.

Local georeferenced output:
`~/Downloads/fletcher-sheet09/expansion-20260910/sheet-09-full-sheet.tif`.
It is an **8393 × 5571 RGBA GeoTIFF**, EPSG:3857, with 5 projected-metre cells.
Its exact SHA-256 and bounds are in `raster-receipt.json`. The local
`full-sheet-preview.png` shows the complete crop. Large rasters stay outside Git.

## Correspondence and trial history

The two original coastal seeds remain unchanged. New controls cover Chéticamp
harbour, Faribault, Fiset, Aucoin, Basile/Pembroke, Farm Brook, Stewart, and the
First/Second Fork mouths on the Northeast Margaree. `point-review-index.json`
identifies the final native/modern crosshair for every control and check.
`context/` retains broader topology views; its modern panels use the old printed
graticule only as a search guide. They are not warped-map accuracy evidence.

The initial 13-control trial and all five proposal packets are preserved.
Before that trial, native review corrected the two harbour tips and the northern
Stewart fork. After scoring, continuous tracing found that **C10 was at the road
crossing, upstream of the actual Stewart mouth**. The brook curls past the mill
before entering the river. The final bank-entry pixel is **[8231, 6494]**;
`stewart-mouth-correction.json` preserves the original and intermediate pixels.
The final crosshair is in `farm-mouth-review/`.

Three controls and excluded check Q05 were then added along Farm Brook. The
working targets were declared before the first score: median 100 m, worst 200 m.
These are refinement gates for this approximately one-mile-to-the-inch map,
not a general claim of survey accuracy or sufficient whole-sheet acceptance.

| Trial | Excluded points | Median / worst ground m |
|---|---|---:|
| Initial 13, affine | Q01–Q04 | 386.321 / 599.784 |
| Initial 13, TPS | Q01–Q04 | 151.325 / 486.564 |
| Draft 16, TPS; C10 corrected | Q01–Q05 | 122.746 / 449.949 |

The last row uses a different check set and is not a direct improvement estimate.
Q01–Q04 are diagnostic replays after model selection and repair. Q05's first
score is **14.938 m**, but it lies near Farm fitting controls and does not provide
independent regional coverage. No check was promoted into this fit.

**Q01 remains uncertain.** The historical long southern Stewart tributary does
not clearly correspond to the selected short modern tributary. Its failed
449.949 m result remains visible; it is not acceptance evidence. Smaller Gallant
and Jim Campbells forks, an unclear Murphys coastal mouth, a supposed Basile
western fork, and the changed-looking Pembroke Lake outline were not adopted.
No channel-change explanation is asserted without evidence.

## Verification and remaining work

- Actual raster overlays were inspected in all ten `warped-review/` regions.
  Farm's main sequence and the corrected Stewart mouth are supported; the
  southwest, eastern mountain valleys, and several headwaters remain displaced.
- The 25-pixel orientation grid has **70,928 samples, no sign reversals**.
  This does not prove the continuous transform has no folds.
- Independent alpha-mask comparison found **44,850,834 interior cells and zero
  holes**, allowing one output cell at the cutline. `coverage.json` records it.
- Unmodified Sheet9/Sheet11 facing edges overlap by approximately **126–499 m**
  over their common longitude interval, including offshore. `sheet11-join.json`
  pins both fits and native edges. This measures footprints, not matching
  features; it is not a reason to stretch either map.
- The application CSV parser round-trips all 16 controls and five checks. Its
  TPS predictions agree with GDAL within **5.5e-9 projected m**. This verifies
  parser/solver consistency, not the browser's raw-scan TPS mesh.
- The actual GeoTIFF was imported and displayed in NSMtS in an isolated
  Playwright profile, then reloaded. Native raster dimensions, embedded CRS,
  stored raster hash and enabled state survived. Desktop and mobile screenshots
  were inspected; no console or page errors were recorded. Browser artifacts
  remain in the local output's `browser/` directory. The Browser plugin was
  unavailable. This tests the embedded-GeoTIFF path, not raw-scan CSV import.

Next: resolve the Stewart tributary, add southwestern coast/Gallant and eastern
Rocky/Jim Campbells support, and freeze a repaired fit before selecting fresh
distributed checks. Then inspect geographic continuity along the Sheet11 join
before promoting either sheet to tiles or production labels.

To reproduce, run `../../full-sheets/render.py` with `draft-fit.json`,
`draft-checks.json`, `boundary.json`, and the verified native PNG; use the
benchmark Python environment with GDAL on PATH. `review_warp.py` uses the actual
output GeoTIFF. `verify_import.ts` bundles with the web workspace's Rolldown and
runs from the repository root. The shared coverage verifier is
`../../sheet14/refinement-20260909/verify_raster_coverage.py`.
