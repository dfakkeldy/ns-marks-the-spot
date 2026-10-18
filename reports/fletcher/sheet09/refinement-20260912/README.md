# Sheet 9 — provisional coastal refinement

**Geographic acceptance is false. Keep this PR draft.** Adding the reviewed western creek mouth Q04 as C25 improves local coast placement, but fresh Rocky and Faribault checks fail at 519.45 m and 418.24 m. Their median is 468.85 m against the unchanged 100 m median / 200 m worst limits. The whole raster and joins with Sheets 6, 8 and 11 remain inadequate. The previous 24-control packet and every original control remain unchanged.

## Evidence and decisions

The original unrotated Q04 crosshair was inspected close and wide against modern coastline, neighboring mouths, road crossing and inland drainage before fitting. Its native [4741,5040] and geographic coordinates are unchanged. C25 contains its original check record and prior 212.38 m error. Q01 Stewart's long historical southern arm and V02 Gallant's near-northward historical arm still have unresolved modern correspondence; neither was promoted. R01, a proposed Murphys Brook coastal mouth, has uncertain historical mill/channel connectivity and remains diagnostic.

The 25-control fit was frozen before collecting new checks. All native crosshairs and marked modern counterparts were personally inspected before their first scores:

- F03 was rejected unscored: its native crosshair marks a bend without a visible northern junction.
- F04's initial modern node J1033 marks a southern spur, while the native feature is the distinct northern arm. Before scoring, select J1025 and move native [8855,4435] to [8865,4430], the actual northern junction. Original coordinates and both reviews remain. Main Rocky, its separate gorge and the western arm's fork order support the corrected correspondence.
- F05 was rejected unscored: the crosshair is off-stream and the historical channel lacks the proposed modern confluence.
- F06 [8500,1742], Faribault's western tributary between the pond-fed eastern C04 and larger C03 fork, was inspected close/wide without correction. The small western arm and larger branch sequence support its identity.

| Fresh check | Preserved 24 controls | Coastal 25 controls |
|---|---:|---:|
| F04 Rocky western arm northern tributary | 519.80 m | 519.45 m |
| F06 Faribault western tributary | 418.37 m | 418.24 m |

Errors are approximate spherical ground metres from GDAL TPS in EPSG:3857. These two northern/eastern checks establish neither distributed whole-sheet accuracy nor the western repair's acceptance. Neither failed check was subsequently promoted or moved. Reused diagnostics retain uncertain Q01 (440.93 m), V02 (499.80 m) and R01 (181.72 m); their scores are not clean geographic acceptance measurements. V01's 3.62 m local lake check does not rescue the sheet.

## Whole raster and joins

All 40 recorded figures were personally inspected: 18 native/modern point figures including failures and corrections, 12 actual warped-raster views, seven adjacent-sheet comparisons and three actual browser screenshots. The original full boundary overview and native/modern search views were also inspected. The printed-graticule affine only locates search windows; physical modern coordinates come from NSTDB line endpoints. Actual raster reviews project reference vectors directly to EPSG:3857.

The western Q04 mouth and nearby coast improve visibly. Farther south, historical coast-parallel drainage and inland curves still disagree. Cheticamp harbour and Grand Etang are partly close but contain shoreline differences. Faribault, Fiset/Aucoin, Farm, First/Second Fork, Stewart, Rocky and the unsupported southwest retain displaced reaches between controls. All seven seam views remain unaccepted: northern Cheticamp/Faribault with Sheet 6, eastern river/valley with Sheet 8, and southern coastline, Gallant/interior and Margaree with Sheet 11. The southern coastline comparison now includes the actual shoreline, unlike the earlier sector named `west-coast` that covered inland ground. No edge was stretched or clipped to hide disagreement.

## Delivery and verification

External complete-neatline GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet09/refinement-20260912/sheet-09-full-sheet.tif`, 8204 × 5415, SHA256 `3e67d70abb9d33a86bdceccd9be00a1e68f98e93f988267ff281a315d5a23edf`.

Fit SHA256: `3ca430d2f637410bec54e0381e0629d2c73e357d0ef981dc26f4f40842be82ec`. Editable files are `sheet-09-controls.csv`, `sheet-09-diagnostic-review.csv` and `sheet-09-validation-review.csv`. Pixels use the original 10762 × 7642 source frame. The complete existing boundary is unchanged, including the western ocean area, printed interior content and all mapped edge features. Source and prior raster hashes are in `baseline-verification.json`; neighboring raster hashes are in `join-provenance.json`.

Local verification passed: preserved controls and promotion history; frozen-fit/check hashes; native review coordinates; source, boundary and reference hashes; 70,928 orientation samples without sign reversal; 42,819,681 interior cells with zero transparent holes; app parser/serialization roundtrip for 25 controls, seven diagnostics and two fresh checks; web/GDAL TPS difference below 0.001 projected metre. Actual My Maps import, enabled state, transparency and original stored raster hash survived desktop and mobile reloads, with no captured browser errors. Browser success and finite coverage/orientation samples do not prove geographic acceptance. Hosted CI is tracked separately in the PR/delivery receipt.

Reproduce from repository root with `reports/fletcher/full-sheets/render.py`, native source, this `repaired-fit.json`, `reused-checks.json`, and `../expansion-20260910/boundary.json`; use GDAL on PATH and the benchmark Python environment. Replay scores with `reports/fletcher/full-sheets/score.py`. Run `python3 reports/fletcher/sheet09/refinement-20260912/verify_packet.py` with external artifacts present. `review_warp.py` and `review_join.py` regenerate actual raster comparisons; `export_csv.py` exports the editable rows. Bundle `verify_import.ts` with the web project's rolldown and run from the root.

Historical source: Fletcher sheet 9, David Rumsey Map Collection/Stanford. Preserve original inventory attribution and CC BY-NC-SA 3.0 source terms; repository MIT licensing does not relicense the scan. Provincial NSTDB reference receipts are retained. No source publication, deployment, merge or Apple changes are included.
