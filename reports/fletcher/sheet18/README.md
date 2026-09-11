# Fletcher Sheet 18 — provisional full-sheet georeferencing

**Geography is not accepted.** The frozen 14-control repair has five fresh checks with median **88.818920 m** and worst **432.571646 m**. The 100 m median / 200 m maximum target fails at the maximum. Coverage and browser checks pass; they do not accept geographic placement. No production layer, label projection, tile revision, licence gate or deployment changed.

## Reviewable artifacts

- `sheet-18-controls.csv`: 14 fitting controls only.
- `sheet-18-diagnostic-review.csv`: the same 14 controls plus two reused checks.
- `sheet-18-validation-review.csv`: the same 14 controls plus five fresh checks, all still excluded from the fit.
- CSV header: `pixel_x,pixel_y,lon,lat,role,label`. Coordinates refer to the **10832 × 7683** native image, not the old half-resolution JPEG. Labels are stable observation IDs; physical identities and modern source vertices are in the JSON records.
- Native source: `/Users/dfakkeldy/Downloads/fletcher-sheet18/native/sheet18.png`.
- Full-sheet GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet18/regional-fourteen/sheet-18-full-sheet.tif` — **8596 × 5608**, RGBA, EPSG:3857, 5 projected metre cells, exact TPS (`-et 0`). Large files remain outside Git.
- `full-boundary-review.jpg`, the native point-review folders, `warped-review/`, and `adjacent-sheet-review/` contain compact review evidence.
- `HANDOFF.md` identifies the remaining geographic work. `status.json` keeps tiling and label projection disabled.

## Source and preserved baseline

The source is [Rumsey Sheet 18](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2643~290011/manifest), “Province of Nova Scotia (Island of Cape Breton). Sheet no. 18.” Attribution: David Rumsey Historical Map Collection. Native PNG SHA-256: `82de26909fee8671007efe39ef86b90099fad303aecfe9e74e2578a1b552a890`. The manifest, TIFF and every downloaded native region have receipts; the acquisition verified decoded region pixels against the mosaic.

`prior-draft/` preserves the September 5 exploratory README, rounded CSV, validation record and manifest byte-for-byte. Its external JPEG is 5416 × 3842. The four original controls and Crane Island check were rounded UI transcriptions, **not an exact browser export**. The original draft records CC BY-NC-SA 3.0 terms; the newly fetched manifest has no licence field. Those records remain distinct from any production permission.

The native conversion is exactly `x × 10832/5416` and `y × 7683/3842`. The odd native height makes `y × 2` incorrect. Original four-decimal longitude/latitude values remain unchanged. The old half-image affine Crane error reproduces at **67.112145 m**, identical after dimension-ratio conversion; the earlier document rounded it to 67.2 m. That one check never established whole-sheet accuracy.

The five native crosshairs were inspected. Their rounded near-tip placements have about 20 native pixels of review uncertainty; the derived diagnostic annotation corrects the old Q01 uncertainty field without changing its coordinates or original file. P04's “crossing” description is imprecise: its crosshair is near a bank tip, and the crossing/shore geometry needs explicit review. The original live-browser placements were not replaced.

The old `tools/fletcher/observations/sheet-18.json` latitude guide does not match the current native scan: its y 1137/3837 values disagree with the visible 45°55′/45°50′ ticks. It remains unchanged. `search-guide-audit.json` records the discrepancy. Candidate search instead used the preserved four-control affine; every new source position was then chosen from physical native detail, and every modern coordinate came from the actual reference geometry.

## Fits, failures and repair

`reviewed-fit.json` freezes the original four controls plus seven physical additions before the new diagnostic checks. Additions are C06–C10 stream junctions and C11 Pellier Point / C12 Morrison Head tips. Native crosshair adjustments made **before fitting or scoring** are preserved in the candidate-stage files and figures. C05 was rejected because the modern southern branch is absent at the proposed historical reach; Q03 was rejected because road marks and small forks could not be separated confidently. Neither is fitted or scored.

C12 uses the outer northern coast of Morrison Head. Modern geometry represents it as an island, while the historical source shows a narrow mainland connection; the neck is not used as a control. C06's junction branch order matches, but the historical eastern headwater is much longer than the modern mapped branch. These limitations remain visible in the packet.

| Fit/check set | Median ground m | Worst ground m |
| --- | ---: | ---: |
| Original rounded four-control affine / old Crane only | 67.112145 | 67.112145 |
| Initial 11 affine / five diagnostics | 201.264076 | 229.993121 |
| Initial 11 TPS / same five diagnostics | 181.102236 | 765.901311 |
| Initial 11 TPS / retained Q01+Q02 only | 122.388567 | 181.102236 |
| Repaired 14 TPS / same retained Q01+Q02 | 103.641778 | 141.291322 |
| Repaired 14 TPS / five fresh checks | 88.818920 | 432.571646 |

Errors are approximate spherical ground metres. The first TPS exceeded the 200 m maximum at Q05 Ross Brook (762.038252 m) and Q06 southwest brook (765.901311 m). Q04 Cranberry Island was 119.106687 m and was added for northern support after the overall fit failed; it did not individually exceed 200 m. Those checks were explicitly promoted without coordinate changes: **Q05→C13, Q06→C14, Q04→C15**. All eleven earlier controls remain unchanged. Old check records and failures remain available.

The repaired fit was frozen at SHA-256 `24cf96fa66b38eb9920c91ec304ffd7e5333f5b825fbe22e64eecc61944f00e4` **before** selecting fresh checks. No fresh point was promoted, fitted or used for further tuning.

| Fresh check | Ground error m |
| --- | ---: |
| V01 | 85.657453 |
| V03 | 432.571646 |
| V05 | 55.994383 |
| V02 | 141.783250 |
| V04 | 88.818920 |

V01 checks the next western tributary along Ross Brook; V03 checks the Ashfield pond outlet; V05 checks the eastern mouth of the McKenzie-branch lake; V02 checks Round Island's northern tip; V04 checks Militia Island's northern tip. V03's 432.6 m failure and V02's 141.8 m error remain unchanged. Nearby check pairs provide local evidence, not uniform whole-sheet coverage.

## Whole-sheet and actual-image review

The cutline retains the entire mapped inner frame, Bras d’Or water and islands, southern mainland strip, and the **Macrae Point label**, which crosses the eastern neatline. A small recorded notch preserves the full label. Full native overview, four corners and enlarged label crop were inspected; no other mapped extension was visible outside the frame. There is no control-hull or corridor clipping.

The 14-control raster has **46,881,199** expected interior cells and **zero transparent interior cells**, with a one-cell boundary tolerance. All **71,821** sampled Jacobian determinants are negative (native y increases downward); there are no sampled orientation reversals. These checks establish raster coverage and sampled topology only.

Nine actual raster windows were inspected alone and against directly projected NSTDB vectors. Northwest Ashfield and western River Denys show displaced streams and pond spacing; Marble Mountain, Sydenham Brook and Beaver Lakes retain substantial headwater and lake-shape differences. The fitted Pellier/Morrison tips lie on their anchors, but nearby harbour banks and islands still differ. The southern-island window retains the mapped islands and shows shoreline offsets. The southeast window visibly retains the Macrae Point label notch.

Four actual join windows compare the raster with provisional Sheet 15 to the north and Sheet 19 to the west, using the exact external raster hashes in `join-provenance.json`. The northwestern join has a gap; other windows retain displaced drainage or coast continuations. No seamless mosaic acceptance follows. Sheet 17's eastern join remains outstanding. Only the 14-control Sheet 18 raster was rendered and reviewed; the old four-control and initial 11 fits are mathematical baselines, not claims of new raster inspection.

## Modern reference and verification

NSTDB extracts cover `-61.24,45.73,-60.82,45.94`: **1711 road**, **125 rail**, **2775 water-line**, and **1348 water-polygon** features. `reference-receipts.json` preserves source query URLs, counts, date, CRS, axis order and hashes. Modern records are reference geometry, not survey ground truth. Geography and historical change are not inferred from empty or failed responses.

The delivered CSV files pass the actual application parser and semantic serialize/parse round trip. The application TPS agrees with GDAL at both reused diagnostics and all five fresh checks; maximum projected difference is **8.79e-09 m**. This verifies data/solver consistency, not image-mesh placement.

The actual GeoTIFF was imported through My Maps → Add a map file in isolated Chromium. Desktop import, desktop reload and mobile 390×844 screenshots were personally inspected. Stored raster SHA, georeferencing, pixel dimensions, preview alpha and enabled state survived reload; captured console/page errors were zero. Receipts link the full local screenshots. This is local browser evidence, not production deployment.

Source/reference hashes, original draft preservation, control preservation, check separation, image-frame coordinates and raster/browser hashes were reverified. No application code changed, so no local native build was required. Hosted CI is a separate PR result.

## Reproduce

Use the benchmark Python environment with GDAL CLI on PATH. Source and reference locations are in the receipts.

```bash
PATH=/opt/local/bin:$PATH /Users/dfakkeldy/Downloads/fletcher-matching-benchmark/venv/bin/python reports/fletcher/full-sheets/score.py --fit reports/fletcher/sheet18/regional-fit.json --checks reports/fletcher/sheet18/validation.json --out /tmp/sheet18-validation-replay.json
PATH=/opt/local/bin:$PATH /Users/dfakkeldy/Downloads/fletcher-matching-benchmark/venv/bin/python reports/fletcher/full-sheets/render.py --source /Users/dfakkeldy/Downloads/fletcher-sheet18/native/sheet18.png --fit reports/fletcher/sheet18/regional-fit.json --boundary reports/fletcher/sheet18/boundary.json --checks reports/fletcher/sheet18/regional-diagnostics.json --out /Users/dfakkeldy/Downloads/fletcher-sheet18/replay
web/node_modules/.bin/rolldown reports/fletcher/sheet18/verify_import.ts --platform node --format esm --file /tmp/verify-sheet18.mjs
node /tmp/verify-sheet18.mjs
```

`review_warp.py`, `review_join.py`, `review_points.py` and `verify-browser.mjs` reproduce the corresponding evidence with the recorded local assets and dev server. Current full-sheet tile revision remains `fletcher-full-sheets-20260909.3`.
