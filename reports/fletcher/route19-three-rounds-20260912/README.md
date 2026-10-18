# Route 19 Fletcher RMS refinement — three rounds, 12 September 2026

Three complete rounds reviewed the four full Fletcher sheets intersecting Route 19 from Port Hawkesbury to Inverness. Each round ran in descending RMS order **14 → 16 → 22 → 19**, recalculated from the selected fits after the previous round. The order happened to remain unchanged.

These are revised, reversible full-sheet drafts. The September 9 mosaic, published layers and downstream label pins remain separately frozen; this packet does not claim a production deployment or uniform geographic acceptance.

## Comparable results

RMS is computed on **identical excluded check coordinates throughout all three rounds**, using GDAL TPS in EPSG:3857 and approximate spherical ground metres. Fitting residuals are not the accuracy metric. All 64 hand controls remain byte-for-byte equal as JSON point records. No check was removed, moved or consumed as a control.

| Sheet | Checks | Starting RMS | Round 1 | Round 2 | Round 3 | Final median / worst |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cape Mabou / Broad Cove 14 | 13 | 129.286 m | 129.286 m | 129.286 m | **126.236 m** | 80.014 / 240.554 m |
| Mabou 16 | 14 | 102.028 m | 102.028 m | 102.028 m | **101.241 m** | 103.890 / 151.310 m |
| Hawkesbury 22 | 17 | 95.608 m | **94.869 m** | **94.826 m** | 94.826 m | 74.285 / 165.407 m |
| Judique 19 | 20 | 90.986 m | 90.986 m | 90.986 m | **90.777 m** | 84.912 / 167.608 m |

The gains are modest. Sheet 14's median improves from 111.581 to 80.014 m, but Hays River H01 remains about 241 m. Mabou's median remains above the earlier working 100 m target. Nearby same-catchment points provide limited independent spatial support. These reused diagnostics informed selection and are **not fresh validation**, survey truth, or proof of whole-sheet accuracy.

## What the rounds found

Each sheet directory retains the baseline, proposals, rejected trials, native/modern crosshairs, decisions and scores. Every adopted proposal was crosshair-reviewed before scoring. Selection required supported correspondence, lower same-check RMS and no increase exceeding 10 m in the worst diagnostic; rendering checks follow selection.

| Round | Sheet | Review and outcome |
| --- | --- | --- |
| 1 | 14 | Re-audited C14/F05/B01 in the southern interior. Boyle-area tributary sequence remained ambiguous; no fit change. |
| 1 | 16 | Tested the distinct split upstream of Glendyer N03. RMS rose to 102.629 m; trial retained but not selected. |
| 1 | 22 | Corrected Q03 modern identity: the former target was a lake outlet, not the historical three-way Tracadie river junction. Selected. |
| 1 | 19 | Reviewed southeastern O09/O10/O11/D04. Downstream Big Brook single-line versus modern bank geometry did not justify a new point. |
| 2 | 14 | Tested the eastern NE/SE fork upstream of F04 after interior review. RMS rose to 129.562 m; not selected. |
| 2 | 16 | Reviewed northeast McQueens drainage. Smaller historical tributaries could not be uniquely assigned to the modern network; no fit change. |
| 2 | 22 | Moved Q01 source point from its northwest incoming arm to the visible junction, (5396,1175) → (5402,1178). Selected. |
| 2 | 19 | Tested O05 source adjustment below the printed graticule after eastern review. RMS rose to 91.625 m; not selected. |
| 3 | 14 | Added MacIsaacs Brook northern tributary at the upper loop, (7443,3486), NSTDB 192282/269070/269071. Selected. |
| 3 | 16 | Added upper River Denys northwest/northeast fork, (8970,5799), NSTDB 198305/265823/265952. Selected. |
| 3 | 22 | Re-audited eastern and mainland banks, inlet and headlands. Existing definitions supported; no further change. |
| 3 | 19 | Moved V07 from its northwest incoming arm to the southern-branch entry, (5105,4356) → (5113,4361). Selected. |

Q03 is the consequential identity correction. Its old NSTDB node joined two `WALK20` lake shores (121129/121130) and outlet 264843. Following 264843 downstream reaches the actual three-stream node at **(-61.54611119916507, 45.592056057710515)**, joining eastern 212484 and southern 264842. The historical source pixel remains (2594,5707). A three-edge vector node alone does not prove a stream confluence. The prior target and full original point record remain in `supersedes`.

[Same-interval boundary comparison](join-comparison.json) retains the existing joins: Sheet 14–16 gap approximately 87–959 m; Sheet 16–19 overlap approximately 130–350 m; Sheet 19–22 maximum gap approximately 381 m. These are coverage distances, not feature errors. The 14–16 maximum is effectively unchanged (959.169 → 959.186 m).

## Editable drafts and raster delivery

| Sheet | Selected fit | Controls | Importable controls and checks |
| --- | --- | ---: | --- |
| 14 | [round-3-fit.json](sheet-14/round-3-fit.json) | 27 | [sheet-14-review.csv](sheet-14/sheet-14-review.csv) |
| 16 | [round-3-fit.json](sheet-16/round-3-fit.json) | 37 | [sheet-16-review.csv](sheet-16/sheet-16-review.csv) |
| 22 | [round-3-fit.json](sheet-22/round-3-fit.json) | 28 | [sheet-22-review.csv](sheet-22/sheet-22-review.csv) |
| 19 | [round-3-fit.json](sheet-19/round-3-fit.json) | 44 | [sheet-19-review.csv](sheet-19/sheet-19-review.csv) |

Source hashes, native dimensions and modern extract hashes are frozen in [inputs.json](inputs.json). Each sheet retains its previous complete content boundary; no control-hull or Route 19 strip clipping, edge stretching or filling was applied. Modern sources are the existing NSTDB extracts and their per-sheet provenance receipts. Historical sources retain David Rumsey Map Collection / David Rumsey Map Center, Stanford University Libraries attribution, CC BY-NC-SA 3.0 and the existing separate project permission receipts.

[Delivery manifest](delivery.json) identifies the portable archive `~/Downloads/Fletcher-Route19-three-rounds-20260912.zip`, which contains the four GeoTIFFs plus editable controls, checks and review evidence. Its SHA-256 and CRC check are recorded in the repository’s external `package-receipt.json`.

Full-resolution outputs live in `~/Downloads/fletcher-route19-three-rounds-20260912/sheet-{number}/sheet-{number}-full-sheet.tif`. Each per-sheet `raster-receipt.json` records the exact hash, dimensions, geographic bounds, fit and boundary hashes. Output cells are 5 projected metres; this does not imply 5 m accuracy.

Import the GeoTIFF directly to view the prewarped full sheet. To edit controls, import the matching original native scan into a separate map, then its CSV and select TPS. CSV import replaces that draft's controls; keep the check rows excluded. Never attach native scan pixels to the resampled GeoTIFF.

## Verification and reproduction

[Packet verification](packet-verification.json) replays every baseline and round score, checks rejected trial scores, verifies the per-round descending order, and confirms all 64 unchanged hand controls. The same 64 excluded diagnostic features remain separate across the four sheets.

Use the existing benchmark Python environment (NumPy, Pillow, Matplotlib), GDAL CLIs and a GDAL Python environment. From this directory, `verify_packet.py` replays the recorded fits without changing them. `render_final.py` invokes the existing full-sheet exact TPS renderer (`-et 0`) for each selected fit. `review_raster.py SHEET` compares actual raster windows against directly projected modern vectors; it does not reuse the inverse search guide.

`verify_import.ts` exercises the application's actual CSV parser, roundtrip and TPS solver. `verify-browser.mjs RASTER OUTPUT_DIRECTORY LAT,LON,ZOOM` tests GeoTIFF import, enabled state, exact stored raster hash, preview alpha and desktop/mobile reload against the local Vite server on port 4198. Playwright is used because the Browser plugin/skill is not available in this session. This tests the prewarped GeoTIFF delivery path; it does not establish native-scan browser TPS-mesh accuracy.

All four CSV roundtrips passed; the maximum application/GDAL disagreement is below 0.000001 projected metre. The Fletcher pipeline suite passed 297 tests with 8 existing skips. Per-sheet coverage and browser receipts record the full raster delivery checks.

Geographic support, raster coverage, browser operation, CI and publication are separate evidence states. The `warped-review` figures retain local shape offsets. Additional independently selected checks would be needed for fresh validation of the frozen revised fits.
