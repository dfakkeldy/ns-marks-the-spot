# Fletcher Sheet 1 — coastal repair trial, 2026-09-12

**Geographic acceptance remains withheld.** Two unchanged failed coastal checks become repair controls in a ten-control trial. A new mouth south of Low Fall improves from **783.373 m to 199.696 m**, but fails the 100 m median target. Its proximity to a repair control limits independence. Inland identities and adjacent-sheet continuity remain unresolved; the trial is a local coastal improvement, not an accepted whole-sheet replacement.

## Source and preservation

Frozen parent inputs come from nightly-history commit `98a34ae2ab2bdec0846a475fc63985d45436a6bf`. All eight prior control records remain identical. Prior proposals, corrections, rejected identities and failures remain in the parent packet. The legacy parent `prior_control_count=0` metadata was inaccurate; the new fit records eight actual prior controls without rewriting the parent.

[David Rumsey Sheet 1 manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2626~280040/manifest), retrieved 2026-09-11. Credit: David Rumsey Historical Map Collection. The manifest licence is null; existing CC BY-NC-SA 3.0 source restrictions and the repository publication boundary remain. This packet does not grant publication permission.

Native source: `/Users/dfakkeldy/Downloads/fletcher-sheet01/native/sheet01.png`, **10874 × 7680**, SHA-256 `ee65feacee038b3f57804b3e88ceedba38bc810682faa79d305ea8000c9130a3`. The original unrotated native boundary overview was personally inspected. The complete mapped ring retains the northern sea and legend, capes, offshore rocks, ponds, inland terrain and labels. No separate mapped extension was visible. Boundary hash: `5585bf075453859428c58bd66e64066f58a1274aad08f89eb97954809b21f910`. No control-hull clipping.

Modern evidence uses the corrected expanded NSTDB extracts at `reference-full`: bbox −60.80,46.93,−60.30,47.15; 326 roads, 1391 water lines, 428 water polygons, no rail features returned. Every reference hash and count is checked against its dated receipt. The earlier incorrect extraction remains preserved. The corrected slanted-crossing graticule guide is search-only; it does not supply fitting controls or validation coordinates. Its eight earlier measured pixels were not remeasured in this pass.

## Repairs and fresh check

- V02 Gulch Brook north bank/coast junction → C10, native `[8405,5406]`, modern `[-60.406089078517745,46.99672668125908]`, exact water-line object 26052, part 0, vertex 48. Prior failure **271.663 m** retained.
- V03 Low Fall mouth → C11, native `[3549,5044]`, modern `[-60.6342323,47.0098426]`, direct node J0091. Prior failure **457.395 m** retained.

Both were personally re-inspected in native close/wide views and modern coastal context, then promoted without changing coordinates. Channel generalization remains a limitation. Fit hash `41f3defeab5ada5b71e1ec2493cb5955fb1f5787cf85969a32f28e586e8043b8`, frozen at `2026-09-12T15:45:14.547855+00:00`, precedes fresh selection and scoring.

F01 is the next distinct stream mouth south of Low Fall, direct node J0110: native `[3389, 5170]`, modern `[-60.6386215, 47.0051259]`. Initial `[3398,5167]` was corrected to the actual stream/coast join **before scoring**, followed by personal close/wide reinspection. F01 was checked against all prior controls and scored/rejected identities for coordinate duplication. It is a new local mouth near C11, not independent inland coverage. Native uncertainty is 25 pixels; modern stream length/generalization differs. The diagnostic and validation CSVs deliberately contain this **same single check**, not separate evidence.

F02 Wreck Cove inland fork was rejected unscored: the proposed pixel was off-channel and surrounding historical branch directions did not establish the modern fork. Older rejected McDougall shoreline C08, Salmon Q01 and southern Lowland Cove V01 remain excluded. No failed check was moved after scoring or silently fitted.

## Actual raster and geographic review

External GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet01/refinement-20260912/sheet-01-full-sheet.tif`

SHA-256 `3b2d00f843c7b1251ead26598fb3c19fe3100472cd79c90b4bbc95cb6066cf81`; **8500 × 5512**, EPSG:3857, RGBA, exact GDAL TPS `-et 0`, 5 projected metre cells. Projected cell size is not ground accuracy. All **71,625** sampled Jacobians retain negative orientation. Independent full-boundary alpha verification finds **44,257,491** interior cells and **zero transparent holes**, with a one-cell boundary tolerance. Cutline hash `52aae714b31eca942774c397a47af39becff38ca15af272fdd9b3217cd883d6c`. Technical checks do not establish geographic acceptance.

Eight geographic windows compare the actual prior eight-control raster, the new raster with modern geometry and the new raster alone. Low Fall and Gulch coast improve locally. Northern cape controls remain supported locally; intervening coastlines, inland Wreck Cove/Salmon geometry, McDougall shoreline and eastern headwaters retain substantial differences. The full northern sea remains unsupported extrapolation. Three actual same-window joins against the experimental Sheet 3 ten-control and Sheet 2 ten-control rasters retain gaps and displaced continuations; neither neighbor is geographically accepted. Exact input raster hashes are in `render-provenance.json`.

All **24 figures** were personally viewed: ten native close/wide frames, eight raster windows, three joins and three browser screenshots. `visual-review.json` records hashes and findings.

## Delivery verification and remaining work

The actual web CSV parser, semantic serialization and TPS solver pass for **10 controls and 1 check**, agreeing with GDAL within 0.000001 projected m. Three editable CSVs preserve roles and original source pixels. The actual My Maps importer passed desktop import, desktop reload and mobile reload in an isolated browser context. TIFF hash, pixel size, preview alpha and enabled state survived reload; console/page errors are empty. This verifies the GeoTIFF path, not the native-image browser mesh's geographic accuracy.

Run `python3 reports/fletcher/sheet01/refinement-20260912/verify_packet.py` from this checkout for integrity checks. `review_points.py`, `search_context.py`, `review_warp.py`, `review_join.py`, `verify_import.ts` and `verify-browser.mjs` retain reproduction recipes. The external source, reference vectors and rasters must remain available. Hosted CI is separate and recorded in the PR.

Keep this PR draft. Resolve the remaining independent inland identities and southern coastal differences before another frozen repair trial and new checks. Any promotion must preserve the original failure. No merge, tiling, label projection, KinNoKi pin or deployment is authorized here. Continue the refinement queue with Sheet 15.
