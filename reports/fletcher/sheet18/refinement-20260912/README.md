# Sheet 18: Ashfield and River Denys refinement

**Draft — neither experiment passes whole-sheet geographic acceptance. Retain the earlier fourteen-control provisional fit.** This packet preserves a fifteen-control regression and the subsequent sixteen-control local repair; it does not change product layers or grant publication clearance.

The fourteen-control fit, original four rounded UI controls, all prior proposals, rejected candidates and scores remain unchanged on nightly history at `c32c85e917aa8746fa0b98f928f76a366127b7ee`. Native source: 10832 × 7683, SHA-256 `82de26909fee8671007efe39ef86b90099fad303aecfe9e74e2578a1b552a890`. Original half-resolution coordinates retain their exact source scaling and world-coordinate precision. The rejected latitude guide remains preserved. New searches use the original four-control affine only as approximate context; actual controls/checks use inspected native pixels and direct NSTDB endpoints.

## Measurements and sequence

| Stage | Change | Fresh checks, ground metres | Outcome |
| --- | --- | --- | --- |
| 14 → 15 | V03 Ashfield pond outlet → C16 unchanged at [2763,1863], previous error 432.572 m | F03 pond inlet 146.010 (old14: 424.560); F04 separate southern pond outlet 943.993 (old14: 100.464) | Median 545.001 m; strong southern regression |
| 15 → 16 | F04 → C17 unchanged at [2716,3259] | F05 first eastern tributary 403.382 (old14: 345.645); F06 lower confluence 108.190 (old14: 266.538) | Median 255.786 m; drainage still fails |

Exact original close/wide native crosshairs and modern geometry were personally inspected before promotion or first score. Repairs were frozen before each new check selection. F01/F02 were rejected unscored for unsupported native junction identities. F04's original [2690,3236] road/pond approach was corrected to the actual southwest outlet [2716,3259] before scoring; both frames and the correction survive. After its 944 m failure it was promoted unchanged for the second experiment. F05/F06 were accepted unchanged before scoring; the historical eastern headwater is shorter than the modern one, recorded as an identity limitation rather than silently tuned.

F03 shares C16's pond. F05/F06 share C17's drainage. These are correlated local observations, not independent whole-sheet proof. Reused diagnostics are separate CSVs: six for fifteen controls and seven for sixteen. The 100 m median / 200 m worst limits fail at both stages. All earlier losses and failed values remain evidence.

## Full-sheet and browser evidence

Both exact GDAL TPS rasters use the unchanged complete boundary, including the Macrae Point label notch, mapped islands, open water and southern mainland. Native whole-source/corners and nine actual warped-region panels per stage were personally reviewed. Northwest shear/rotation and mismatched headwaters remain. Eight final sixteen-control neighbor windows cover Sheets 15, 19, 17 and 21: northern/western/southern stream and coast continuations remain displaced with gaps; eastern open water provides little geographic evidence. The fifteen-control stage has nine regional comparisons but no newly rendered adjacent-sheet set.

Fifteen controls: 48,011,486 interior cells checked, zero transparent cells. Sixteen: 47,516,104, zero transparent. Each samples 71,821 negative Jacobian determinants with no nonnegative values. These checks establish coverage and sampled orientation only.

Both rasters were actually imported into the local web map and reloaded on desktop and mobile. Stored raster hashes and dimensions match, enabled state survives, screenshots were personally viewed, captured errors are empty. This proves local import behavior, not production deployment or geographic acceptance.

## Editable artifacts and reproduction

Root CSVs contain 15 controls / 6 reused diagnostics / 2 fresh checks. `16-control/` contains 16 / 7 / 2. Both use the actual web CSV parser and TPS solver; semantic roundtrips and comparison with GDAL pass. `verify_import.ts` accepts either stage directory; `verify_packet.py` checks hashes, parent history, unchanged controls, chronology, exact frames, direct modern coordinates, CSV evidence, coverage, browser persistence and the 50 viewed image hashes.

External GeoTIFFs remain outside Git:

- `/Users/dfakkeldy/Downloads/fletcher-sheet18/refinement-20260912/sheet-18-full-sheet.tif` — 8743 × 5786, SHA-256 `c499949e17ae88a4432b5a42e03a1d4481e3224f38a10f1de23fa101719cc4c1`.
- `/Users/dfakkeldy/Downloads/fletcher-sheet18/refinement-20260912/16-control/sheet-18-full-sheet.tif` — 8549 × 5783, SHA-256 `13f2d9132a3470cab06e97dd011b23d888422c54352151971fb62abae4bcbb72`.

Fit hashes, cutline hashes, source/reference receipts and neighbor hashes are in the frozen fits, raster receipts and `render-provenance.json`. `reports/fletcher/full-sheets/render.py` reproduces each raster with its reviewed fit, parent boundary and diagnostic checks; `score.py` uses the frozen fit and validation checks. The review scripts use benchmark Python plus GDAL CLI; coverage uses the preserved Sheet 14 coverage verifier. The original CC BY-NC-SA 3.0 collection terms, attribution and null manifest licence remain unchanged. No merge or deployment is authorized by this packet.
