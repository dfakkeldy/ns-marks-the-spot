# Richmond eastern repair and fresh regional validation

The ten-control TPS scores **236.5 m RMS on six new physical checks**, with median **156.5 m**, empirical P95 **401.5 m**, and maximum **455.2 m**. Mean residual is 28.3 m east / 128.6 m north (warped minus reference). On these exact same six features the preceding seven-control fit scores 642.5 m and the intermediate eight-control fit 565.5 m. The final fit was frozen before the H01–H06 measurements and has not been tuned against them.

This passes the existing numerical coarse-alignment gate (minimum six checks, RMS ≤400 m, P95 ≤900 m, maximum ≤1500 m), but misses the declared 200 m refinement objective. It does **not** establish whole-sheet acceptance. Three western islands share one basin, three checks are eastern basins, and four checks lie outside the source control hull. Grand Narrows and southern Isle Madame now have earlier diagnostic coverage; northwest/interior and southwestern mainland coverage remain weak. P95 is an observed sample statistic, not a confidence guarantee.

## Repair history

The eight-control experiment exposed two eastern errors of 747 m and 831 m. Promoting only the isolated interior lake G04 caused an 806 m overshoot at Peebles Lake. `nine-control-trial.csv` and its fourteen-check result preserve that rejected trial. Both independently identified lakes then became controls, unchanged in pixel or modern coordinates; all preceding checks are diagnostic. The final thirteen-point diagnostic RMS is 145.8 m (median 120.5 m, maximum 267.3 m). This thirteen-check set excludes both promoted lakes in every model, so it is not directly comparable with the preceding fourteen- or six-check summaries.

The ten-control affine trial scored 183.8 m on those thirteen diagnostics. TPS was selected before the fresh set was measured. `control-sensitivity.json` records every leave-one-control-out trial on the diagnostic set; no omission was adopted. Sparse northern and southern anchors remain influential. There is no claim of zero error from the interpolating control residuals.

## Evidence and replay

- `control-promotion.json` / `second-control-promotion.json`: G04/G05 identities, unchanged coordinates and role changes.
- `frozen-fit.csv`: ten controls and thirteen diagnostics, frozen hash `a38b2074b7c5e525b684b02a8d848b7be6f8299bdcc53647afdb1dce09d800be`.
- `fresh-checks.json` / `.csv`: six new native observations and uncertainty estimates; native/reference crosshair images and exact reference features accompany them.
- `fresh-scores.json`: headline fresh result, direction and source-hull status; `same-six-stage-comparison.json` compares the identical check set without further fitting.
- `richmond-refined-v4.csv`: combined inventory. Do not present its pooled nineteen-check RMS as fresh validation.
- `parser-verification.json`: production web parser round-trip and TPS/GDAL agreement within 0.001 projected metre, separate from geographic error.
- `boundary-review/`: full-source crop corner audit, exact frames, and unchanged expanded boundary hash. The northern extension and southwestern mapped area are retained; insets and heavy outer frames are excluded. Engraving immediately adjacent to inset rules remains an edge limitation.

The new eastern NSTDB query supplies complete water-line geometry where the former cache stopped. Its 3,643 unique features, bounds, URL, hash and paging method are recorded in `east-reference-receipt.json`. The merged review reference has 17,257 features; its 261 overlapping IDs have identical geometry. Lines are projected directly onto delivered raster windows, avoiding polygon-extract seams.

All distances are horizontal ground metres, using local equirectangular distance at mean latitude and radius 6,371,008.8 m; EPSG:3857 projected differences are not reported as ground error. Source pixels refer to the continuous native 35,735 × 30,429 archival TIFF frame. Placement/feature uncertainty remains in the measurements.

The source and derived review images retain David Rumsey Map Collection / Stanford Libraries provenance and CC BY-NC-SA 3.0 terms. The large source and GeoTIFF artifacts remain outside Git. Raster validity, browser import, source-content coverage, numerical checks, geographic acceptance and publication are separate states. No map catalog activation or tiles are implied by this report.

## Delivered raster and visual checks

`artifact-receipt.json` records the full source SHA and exact `GDAL TPS -et 0` warp, 26,361 × 17,991 pixels at 5 projected metres per cell. Local artifact SHA-256 is `32ca1073e47b9b3d7f03dc1eb0e6d4f2d51d3012f34640d15e6bb2b3b205d2a8`. All 30,435 sampled Jacobians preserve orientation; this finite sample is not a continuous fold-free proof.

`coverage.json` finds no transparent holes among 331,234,927 expected interior cells, allowing one boundary cell for rasterisation convention. `warped-review/` contains directly projected original NSTDB lines on actual GeoTIFF windows for Inhabitants Basin, eastern lakes, Fourchu, Grand Narrows and southern Isle Madame. These views show local shape/position differences, particularly around the Framboise peninsula, and support keeping the result provisional.

`browser-verification.json` records successful full-artifact import and persistence after reload at zoom 12–13, with no captured console errors. Browser display downsampling is expected. Neither browser success nor alpha coverage asserts geographic acceptance.
