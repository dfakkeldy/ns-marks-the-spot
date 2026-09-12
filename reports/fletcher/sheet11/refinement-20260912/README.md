# Sheet 11 refinement — provisional western repairs

**Geographic acceptance: false. Keep this PR draft.** Both new TPS trials preserve the complete mainland extension and the separate Sea Wolf/Margaree Island with its printed name. The latest 30-control trial improves Mill Valley and the creek south of Marsh Point, but its fresh median is 100.43 m and worst is 216.09 m, exceeding the frozen 100/200 m limits. Its western checks do not establish distributed whole-sheet accuracy. The southern coast, river reaches between anchors, and joins with Sheets 9, 10, 13 and 14 remain inadequate.

The existing 26-control packet remains unchanged. This directory preserves the failed 28-control round, and `30-control/` preserves the subsequent trial. Original proposals, pre-score pixel corrections, prior failures, diagnostic checks and all controls remain available. No deployment, merge, source replacement, or Apple changes are included.

## Repair and validation sequence

1. Personally inspect original unrotated close/wide crosshairs for old Q04, Q03, V06 and V07 against marked modern drainage and broader coast/branch context. Q04 and V06 have supported identities and become W04 and W05 without coordinate changes. Q03 has ambiguous short headwater topology under hatching; V07 has changed Margaree channel/island context. Neither becomes a control.
2. Freeze 28 controls before collecting F08–F10. F08's original crosshair was beside a western stub; move to the actual eastern tributary, then 12 pixels down to its junction, all before scoring. F09 moves nine pixels west and three south to its actual fork before scoring. F10 stays unchanged. Every proposal and review frame is retained.
3. Score the reviewed checks. The 28-control round fails. Promote supported F09 and F10 unchanged to W06 and W07, explicitly retaining their prior failed scores in each promotion record. Freeze 30 controls before collecting F11–F13.
4. Inspect all six new F11–F13 close/wide figures before their first score. Coordinates remain unchanged. These checks improve over both preceding fits, but fail the fixed limits. No further promotion is made.

| Check | Prior 26 controls | 28 controls | 30 controls | Use |
|---|---:|---:|---:|---|
| F08 Murdoch MacLeods eastern tributary | 143.47 m | 161.30 m | 218.96 m | Fresh in 28, reused diagnostic in 30 |
| F09 creek south of Marsh Point | 371.00 m | 333.09 m | Fitted W06 | Fresh failure retained |
| F10 Mill Valley western tributary | 451.15 m | 449.19 m | Fitted W07 | Fresh failure retained |
| F11 next Mill Valley western tributary | 555.20 m | 552.61 m | 83.85 m | Fresh in 30 |
| F12 coastal creek southwestern tributary | 421.50 m | 384.30 m | 100.43 m | Fresh in 30; near W06 |
| F13 Mill Valley eastern tributary | 338.00 m | 339.56 m | 216.09 m | Fresh in 30 |

Metrics are approximate spherical ground metres from GDAL TPS in EPSG:3857. Training residuals are not acceptance evidence. A copied point's historical `status` text describes its earlier review state; the current `role` and explicit `promotion` record govern whether it is now fitted.

## Visual findings

All 68 recorded figures were personally inspected, including original/corrected native crosshairs, 20 actual warped-raster review windows, 16 neighboring-sheet comparisons, and six actual browser screenshots. Search guides only locate native windows; scored modern nodes come from NSTDB line endpoints, and warped comparisons project modern reference vectors directly.

The 28-control additions improve individual western junctions without resolving the longer creeks. The 30-control trial further improves the large Mill Valley fork and southern coastal creek, while F08 worsens and the coast near the southwest edge remains displaced. Grey Point and Sea Wolf Island retain partially close shorelines but uneven outline agreement. Tompkins/Margaree channel loops differ; small reused residuals elsewhere do not resolve identity or intervening geometry. Mink/Gallant, Martha/Ranalds, Cameron, Middle River and Marsh/Black Brook windows show uneven inter-anchor stream agreement. The eight seam windows in each round retain gaps or stream disagreement. Sheet 10 uses the preserved twelve-control baseline; Sheet 13 uses the external fourteen-control draft; Sheet 14 uses its preserved Hay revision. Their raster hashes are pinned in `join-provenance.json`.

## Artifacts and verification

Latest external GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet11/refinement-20260912/30-control/sheet-11-exact.tif`, 9398 × 5867, SHA256 `b765d51fc4466a9f17dae197898f1cbe84208127b9987bf238adc8dbe7aec95f`.

Preserved 28-control GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet11/refinement-20260912/sheet-11-exact.tif`, SHA256 `89ce10ceca225e79aaccaa0fd9c0b9a0655e0e7102d534e7858d5d0fe1084e1a`.

Each directory contains editable `sheet-11-controls.csv`, `sheet-11-diagnostic-review.csv` and `sheet-11-validation-review.csv`, fit/freeze records, separate validation and diagnostic scores, raster receipt, coverage result and browser evidence. Use the original 10771 × 7551 source frame for CSV editing, never a cropped or rotated derivative.

Local verification passed:

- All 26 original controls retained in 28, and all 28 retained in 30; promotions preserve coordinates and earlier failures.
- Source, fit, two boundaries, reference files, neighboring rasters, review frames and final artifact hashes verified; baseline is an ancestor of nightly.
- Exact GDAL TPS with `-et 0`, 5 projected metre output cells; 73,418 sampled Jacobians preserve orientation in each round.
- Interior alpha coverage: 48,835,569 cells in 28 and 48,614,349 in 30, zero transparent interior cells.
- Actual app CSV parser and serialization roundtrip: 28/10/3 and 30/11/3 controls/diagnostics/fresh checks; web TPS and GDAL agree within 0.001 projected metre.
- Actual GeoTIFF import through My Maps, enabled state, stored byte hash, transparency and rendering survive desktop and mobile reloads. No captured browser errors. These prove import behavior, not geographic acceptance.

Run `python3 reports/fletcher/sheet11/refinement-20260912/verify_packet.py` from the repository root with external artifacts available. `render.py` in each round recreates its exact two-component raster using GDAL on PATH. `export_csv.py` accepts an optional round directory. Bundle `verify_import.ts` with the web project's rolldown and run with a trailing-slash directory argument. Hosted CI status is tracked separately in the PR/delivery receipt.

Historical source: Fletcher sheet 11, David Rumsey Map Collection/Stanford. Preserve the original inventory attribution and CC BY-NC-SA 3.0 source terms; repository MIT licensing does not relicense the scan. Modern references use the existing provincial NSTDB receipts. No source licensing inference is made from empty manifest fields.
