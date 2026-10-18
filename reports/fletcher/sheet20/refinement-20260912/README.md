# Sheet 20: inlet island refinement

**Draft — local island checks improve; whole-sheet geographic acceptance still fails.** The fourteen-control experiment is useful for the inlet, but upper Grand River and northeastern drainage remain unsupported. Preserve the twelve-control baseline alongside it.

## Frozen repair and measurements

The original twelve controls remain identical. After personally inspecting exact original native close/wide crosshairs and complete modern coast context, V02 Doctor Island southern tip became C15 unchanged at [2728,2422] (prior 206.974876 m), and V03 St Peters Island northern tip became C16 unchanged at [2327,5497] (prior 269.898737 m). V05 Red Island keeps its original 216.989151 m failure and coordinates; its historical elongated outline differs strongly from the modern island, so it was not promoted or moved.

The repair was frozen before fresh selection. F01 Moonac northern tip was caught as an exact-world-coordinate duplicate of original Q02 before validation scoring and withdrawn; its proposed pixel and figures survive, and original Q02 remains the reused diagnostic. The duplicate assertion prevented creation of the validation file, so two initial score commands stopped without producing values. F02/F03 were personally reviewed unchanged before their first score.

| New check | Native pixel | Twelve-control baseline | Fourteen-control experiment |
| --- | --- | ---: | ---: |
| F02 Alick Island southern tip | [3384,2338] | 100.712478 m | 10.067748 m |
| F03 Abois Island southern tip | [2676,2864] | 194.130338 m | 65.958570 m |

Median 38.013159 m / worst 65.958570 m pass the declared 100 / 200 m limits **for these two local checks**. They are separate islands but spatially clustered within an already controlled inlet. Six reused diagnostics are 63.850187 m median / 165.662075 m worst and remain separate. No independent whole-interior validation is claimed. New upper Grand River search context still did not establish reliable branch identities; previously rejected C11/J0188 and C12/J0222 remain rejected.

## Actual full sheet

Source dimensions 10792 × 7662, SHA-256 `3be7a138e4fd1a42cef0a549b7317180718a36fc7134777323ff2f1f8eb053dc`. The complete source boundary retains Red Point, Red Island, Michaux Point and its nearby island, all mapped southern extensions and two detached AB islets. All three rings use the same exact TPS. Full native overview, corners, southern close-up and nine actual old/new warped-region panels were personally inspected. St Peters Island's north tip and inlet islands improve, while island widths, mainland shores, upper Grand River routing and northeastern streams still disagree. Both tiny southern AB islets and labels remain present.

Five direct comparisons against Sheet 17 north and Sheet 21 west were personally inspected. Gaps and displaced shore/stream continuations remain; no seam is accepted. Neighbor GeoTIFF hashes are pinned in `render-provenance.json`.

External GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet20/refinement-20260912/sheet-20-full-sheet.tif`, 8374 × 6108, EPSG:3857, 5 projected metre cells, exact GDAL TPS, cubic RGBA. SHA-256 `8c98db3aa2da6abb4c8347c096d2c7f3d49eb22c5c4c45539126bff15ded9cfa`. Fit SHA-256 `4f661910ecdf4de6ac22cb6db3352375467f08b2287083e5d32e908c6f4b06b1`. Coverage checks 45,359,402 interior cells with zero transparent holes. All 72,292 sampled Jacobians are negative, including 15/16 on the two detached islets. This proves coverage and sampled orientation, not geography.

## Verification and replay

Editable CSVs contain 14 controls, six reused diagnostics and two fresh checks. The actual web parser roundtrips all three and the web TPS agrees with GDAL. `verify_packet.py` verifies source and parent nightly hashes, unchanged original controls, freeze chronology, exact native frame coordinates/radii, direct modern coast vertices, score hashes, coverage and browser raster persistence. Frozen parent inputs belong to nightly commit `c32c85e917aa8746fa0b98f928f76a366127b7ee`.

The first browser run imported successfully but the local Vite server became unavailable during reload (`ERR_CONNECTION_REFUSED`, loading screen). `browser-first-attempt/` preserves that evidence. The server was restarted and the complete import/desktop/mobile reload sequence repeated. The final import and desktop/mobile reload passed with identical stored raster hashes/dimensions, enabled state preserved, and no captured console/page errors. All 37 packet figures, including the failed loading screen and final browser screenshots, were personally inspected. No source, fit or check was changed for this retry.

The first `repair-wide` set expanded modern context only because a copied wrapper missed spaces around the native radius expression. Those figures survive. Correct `repair-native-wide` frames at ±350 native pixels were rendered and personally reviewed before any promotion. Fresh wide frames also use ±350. Parent search-guide provenance retains its old source hash and inaccurate three-parallel QA sentence; the two confirmed latitude labels are used only for rough search context, never to invent a physical world point.

Run `render.py` using the existing benchmark Python and GDAL CLI to recreate all three components. Score `validation.json` and `diagnostic-checks.json` separately with `../full-sheets/score.py` from the Sheet 20 parent context. Use the preserved Sheet 14 coverage verifier on the resulting `cutline.geojson`. Bundle `verify_import.ts` with web's rolldown; `verify-browser.mjs` imports the external GeoTIFF into the local port 4199 map. Original references include a returned-empty railway response, not proof of absence. Rumsey/Stanford credit, CC BY-NC-SA 3.0 collection terms and null manifest licence remain unchanged. No active layer, deployment pin, merge or production publication changes.
