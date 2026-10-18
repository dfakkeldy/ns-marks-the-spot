# Fletcher Sheet 15 — provisional full-sheet trial

Geographic acceptance is **withheld**. Four fresh checks selected after the eleven-control TPS freeze score **103.603 m median / 284.007 m worst**, failing the declared 100/200 m research target. Hume Island is visibly displaced in the actual output, and the central headwaters, Little Narrows and adjacent-sheet joins remain unsupported. This packet preserves a usable local GeoTIFF, editable controls, rejected candidates, failures and review evidence; it does not authorize tiling, label projection or production publication.

## Source and complete mapped area

[David Rumsey Sheet 15 manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2640~290008/manifest), retrieved 2026-09-11, identifies “Province of Nova Scotia (Island of Cape Breton). Sheet no. 15.” Attribution: David Rumsey Historical Map Collection. The manifest's licence field is null; this packet does not alter the repository's existing permission or publication boundary.

- Native source: `/Users/dfakkeldy/Downloads/fletcher-sheet15/native/sheet15.png` — **10832 × 7582** pixels.
- Source SHA-256: `7a5e7ec0e1a8ce9c6095d4b8e65abb11f86841a337a7b937ddbb084261bb1b72`.
- Every downloaded native region passed pixel parity against the mosaic; per-region rectangles and hashes are in `source-receipt.json`.
- Original `tools/fletcher/observations/sheet-15.json` has a different source hash and remains unchanged. Its printed graticule was used only as a search guide, never a physical fitting control. The current scan's 61°10′ and 46°5′ labels were inspected directly.
- The boundary lies just outside the complete inner neatline. Full-scan and four native-corner review retain the channel, islands, shoreline, lake and all interior terrain. No mapped extension was visible outside that rectangle. `boundary-overview.jpg` shows the actual ring in red. No corridor or control-hull clipping.

Four paged NSTDB extracts cover `-61.26,45.90,-60.81,46.115`: **3097 roads, 76 rail features, 3893 water lines and 1249 water polygons**. `reference-receipts.json` records source endpoints, dates, counts, CRS/axis order and verified hashes. Modern source geometry is reference evidence, not survey ground truth. All full imagery and reference vectors remain outside Git.

## Controls, failures and validation

Nine physical controls were frozen in `reviewed-fit.json` before diagnostic selection. Original and corrected crosshairs were inspected on the native scan alongside the modern network or coastal geometry. Native uncertainty is recorded per point. Control proposals, intermediate revisions and final records remain separate; a proposal figure headed “control” does not establish that it entered the fit.

C03 was rejected because its modern northern tributary could not be identified on the source. C06 was rejected because the small western tributary occurs in a different order around the proposed Cave/McAskill fork. C02 moved from an unidentifiable inland tributary to the actual western-bank river mouth before fitting. C09 required a native branch audit: its final point is the small northern tributary on the eastern MacKinnon arm above the larger downstream fork. All earlier proposals remain available.

| Fit / check set | Count | Median m | Worst m |
| --- | ---: | ---: | ---: |
| 9-control affine, initial diagnostics | 5 | 106.945 | 563.818 |
| 9-control TPS, same diagnostics | 5 | 104.964 | 324.403 |
| 11-control TPS, reused diagnostics | 3 | 105.983 | 147.417 |
| 11-control TPS, fresh validation | 4 | **103.603** | **284.007** |

Failed Q01 (eastern Lake Ainslie mouth, 287.270 m under nine-control TPS) and Q03 (Blues Brook northern tributary, 324.403 m) were **explicitly promoted** to C12 and C13. All nine prior controls remain identical as point records. Their original failures remain in `tps-diagnostic-scores.json`; promoted points are excluded from subsequent checks. Do not compare the five-point median to the three-point median as an improvement. On the same three reused points, the nine-control TPS median/worst were 96.254/104.964 m; the repaired fit makes those diagnostics worse while adding local support.

`regional-freeze.json` fixes the eleven-control TPS before the fresh checks. V01 is the southwestern Blues Brook tributary below the intervening northeastern tributary; its first proposal selected the wrong branch and was corrected before scoring. V02 is the upstream northern fork of the western Lake Ainslie brook. V03 is Hume Island's eastern tip; V05 is MacIver Island's western tip. Fresh residuals are **48.095, 111.634, 284.007 and 95.571 m** respectively. None was fitted or used to tune this raster. V04's paired MacKinnon branches and earlier diagnostic Q06 remain excluded because identities were unresolved, with rejected records retained.

## Raster and actual geographic review

Local artifact: `/Users/dfakkeldy/Downloads/fletcher-sheet15/regional-eleven/sheet-15-full-sheet.tif`

- SHA-256: `7f27bdaa39bb8358f1cbdd7c70a0dd0614336c60edcac2a044ce3ed70c07883f`.
- **8383 × 5785**, EPSG:3857, RGBA, 5 projected metre cells, exact GDAL TPS (`-et 0`). Five projected metres are not five ground metres here.
- Fit SHA-256: `abc9f6ba93d9196051f573a42e1aeeb872c5eda76e9229ab7b6116444cefd41e`.
- Boundary SHA-256: `1d6afd62fe504a68f70fc0397bdd8a12ebc8b4956179ebbbe45e43c286571ff8`.
- Independent coverage check: **46,634,231 interior cells, zero transparent holes**, one-cell boundary tolerance.
- **71,854** sampled Jacobians were negative (native y points down), range **−29.0010 to −20.5937**. Sampling alone does not prove the surface is fold-free.

Nine actual GDAL raster windows were inspected, alone and overlaid with modern geometry: northwest/lake, northeast shore, southwest/Blues, southeast/MacKinnon, central interior, McPhedran, channel islands, Little Narrows and Hume Island. These use geographic windows of the delivered TIFF, not the inverse graticule guide. Lake McPhedran's outlet and much of the channel are locally close, while the lower McPhedran brook, central headwaters and Little Narrows retain offsets or different configurations. Hume Island's entire historic outline lies southeast of its modern counterpart; its failed check is not a small crosshair-placement issue. The source islands remain visible and intact.

Four same-window comparisons against provisional Sheet 13 (north: Lake Ainslie and eastern interior) and Sheet 16's 36-control revision (west: northern and southern interior) were also inspected. Stream/shoreline continuations and coverage gaps remain; no join is accepted. `join-provenance.json` pins all three raster hashes. `matching-context/` contains the earlier native-grid/modern-search comparisons and their native boxes; those are search evidence only.

## Import and reproducibility

All three CSV files use the app's existing Fletcher header and original source pixels. The actual parser, serialization and TPS solver verified **11 controls, 3 reused diagnostics and 4 fresh validation checks**, with maximum web/GDAL disagreement below **0.000001 projected m**. This is numerical consistency, not geographic acceptance.

The delivered GeoTIFF was imported through the actual **My Maps → Add a map file** UI in an isolated Chromium profile. Desktop import, desktop reload and mobile reload were personally inspected. Stored TIFF hash/bytes, embedded georef, pixel size, alpha and enabled state survived reload; **zero console/page errors** were captured. `browser-verification.json` links exact screenshots and the full external receipt. This tests the GeoTIFF delivery path; it does not establish the native-image browser mesh's geography.

From the repository root, with the benchmark Python and GDAL on PATH:

```sh
PATH=/opt/local/bin:$PATH /Users/dfakkeldy/Downloads/fletcher-matching-benchmark/venv/bin/python reports/fletcher/full-sheets/render.py --source /Users/dfakkeldy/Downloads/fletcher-sheet15/native/sheet15.png --fit reports/fletcher/sheet15/regional-fit.json --boundary reports/fletcher/sheet15/boundary.json --checks reports/fletcher/sheet15/regional-diagnostics.json --out /Users/dfakkeldy/Downloads/fletcher-sheet15/regional-eleven
PATH=/opt/local/bin:$PATH /Users/dfakkeldy/Downloads/fletcher-matching-benchmark/venv/bin/python reports/fletcher/full-sheets/score.py --fit reports/fletcher/sheet15/regional-fit.json --checks reports/fletcher/sheet15/validation.json --out /tmp/sheet15-validation.json
web/node_modules/.bin/rolldown reports/fletcher/sheet15/verify_import.ts --platform node --format esm --file /tmp/verify-sheet15.mjs
node /tmp/verify-sheet15.mjs
```

`review_points.py`, `review_warp.py`, `review_join.py`, `search_context.py` and `verify-browser.mjs` preserve the review recipes. `preservation-verification.json` records source/reference checks and control/check isolation. `handoff.json` carries exact source pixels, hashes and remaining work for the next review or later label draft. Local checks and hosted CI are separate from geographic acceptance. No app implementation, active tile revision (`fletcher-full-sheets-20260909.3`), KinNoKi pin or deployment changes are included.

## Remaining work

- Fresh validation median 103.603 m and worst 284.007 m fail the 100/200 m target. Hume Island V03 is visibly southeast of modern geometry; preserve all four checks and residuals.
- Lake Ainslie upper eastern shore and northwestern headwaters retain displaced geometry despite Q01/C12 local support. Audit the distinct stream-mouth sequence before adding more shoreline controls.
- Central Lewis Mountain / McKay headwaters and Little Narrows have substantial branch and shoreline configuration differences. Resolve source generalization or landscape change separately from transform error.
- C03 northern tributary, C06 Cave/McAskill fork ordering, Q06 western-arm tributary and V04 paired MacKinnon branches remain rejected or unresolved. Do not silently restore them to a fit or acceptance set.
- Southeastern interior has sparse independent support; C09 anchors one identified tributary but does not validate the surrounding valley or harbour.
- Four actual joins against Sheets 13 and 16 retain gaps or displaced stream/shoreline continuations. No seamless mosaic acceptance.

Continue the adjacent queue with Sheet 18 while this packet remains a draft. Any later repair must keep these failures, explicitly promote any reused check, freeze the new fit and select new independent checks.
