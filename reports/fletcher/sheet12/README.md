# Fletcher Sheet 12 — provisional full-sheet georeferencing

**Geographic acceptance failed; draft review packet.** Five fresh checks on the frozen 14-control TPS have median **80.306054 m**, worst **1111.670765 m**. The limits are median ≤100 m and worst ≤200 m. V02 in the northwestern Musk Rat Brook network and V05 at Fraser Point fail the worst-point limit. No hosted layer, merge, publication, or production acceptance is implied.

The [full raster review](warped-review/full-sheet.jpg) retains the complete mapped frame and all three southern extensions in one warp. Full native crosshairs, actual warped raster regions, western joins, and actual browser import/reload were personally inspected. Raster/CSV/browser correctness does not establish geographic accuracy.

## Deliverables

- Local GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet12/regional-fourteen/sheet-12-full-sheet.tif` — 8567 × 6581, RGBA, EPSG:3857, 5 projected metre cells. SHA-256 `70f38cadb03bbb6d0b5753a96cf1802800d2e7b03503490a660121e10d589b98`.
- [Controls CSV](sheet-12-controls.csv): 14 controls.
- [Diagnostic review CSV](sheet-12-diagnostic-review.csv): those 14 controls plus one reused diagnostic, Q02.
- [Fresh validation review CSV](sheet-12-validation-review.csv): those 14 controls plus five never-fitted checks.
- [Final fit](repaired-fit.json), [fresh validation](validation.json), [scores](validation-scores.json), and [handoff](HANDOFF.md).

CSV labels carry stable point IDs; JSON carries identity, uncertainty, modern object/node IDs and preserved candidate history. These files use original native pixel coordinates, not resized-image coordinates. Large native images, references, TIFFs and browser screenshots stay outside Git at their recorded local paths.

## Source and boundary

Direct Rumsey item [RUMSEY~8~1~2637~290005](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2637~290005/manifest) is Sheet 12, native 10801 × 7713. PNG SHA-256 `72f758991fe7bce3eba450aecb030b5b681ad037f44168c34ad7c5e82e20034f`. [Source receipt](source-receipt.json) records manifest, TIFF, region hashes and exact pixel parity for all 24 direct native regions. This is a newly assembled native PNG encoding; the prior July source hash is retained unchanged in the original observation. No previous physical Sheet12 packet was found within the documented [search scope](prior-state.json).

[Boundary](boundary.json) SHA-256 `71bc58ceb5476a5ca9b98fd8be187d4ea88b4052cad67a37c1f534bfbdb6c720` preserves the main map and three connected lower notches: southwest shore, Stony and Kidston islands and the Red Point label; Coffin Island/Point, Kemp Head and Point Clear; and the Lockman Point extension. Native corners, extension crops and the Point Clear/Red Point labels were inspected. The southwest notch was widened before fitting so the Red Point label is whole. Whitespace and incidental marginal text are intentionally retained. There is no land-only or control-hull crop.

[Guide audit](guide-audit.json) preserves the original grid-only observation and CSV byte-for-byte. Ten Cartesian intersections of five meridians and two parallels guide searches only. The 46°15′ / 46°10′ N and outer longitude labels were personally read; printed slant remains a guide limitation. No grid intersection participates in physical fitting or validation.

[Modern source receipts](reference-receipts.json) record direct paged NSTDB queries for roads (3451 features), rail (38), water lines (4056), and water polygons (1637), longitude/latitude EPSG:4326. Query bbox is −60.88, 46.08, −60.44, 46.29. Some returned crossing geometries extend south into the map extensions; complete modern feature coverage below 46.08 N is not claimed. Missing data there is not evidence of absence. Modern source geometry is reference evidence, not survey ground truth.

## Physical evidence and repair

The initial twelve physical controls were frozen before diagnostics. Initial candidates and every correction are preserved in [candidate-controls](candidate-controls.json), [corrected-candidates](corrected-candidates.json), and their figures. Native inspection corrected C01 from a bridge/upstream tributary to the actual Sam/Baddeck confluence at J0677; C02 to the Christopher/Big Glen confluence at J0419; and C06 from an upstream McRae junction to J0851. Modern channel widening and braiding around the river controls remain limitations. Coastal native picks were refined on the original scan; C12 moved from adjoining shoreline to Lockman Point's hooked northern tip. C08 was rejected unscored: its initial crosshair was on land and bank/centreline correspondence at the altered Herring/Baddeck confluence was insufficiently unique.

Three reviewed diagnostics were scored after the twelve-control freeze. Q03's proposed modern Coffin Island feature lacked sufficient shared context and scale agreement; Q04 had competing Bevis Point lobes and a reshaped modern shoreline. Both were rejected before scoring and remain visible in [corrected diagnostics](corrected-diagnostics.json).

| Fit / check set | Median ground m | Worst ground m |
| --- | ---: | ---: |
| Initial 12, affine, three diagnostics | 81.736924 | 398.450568 |
| Initial 12, TPS, three diagnostics | 182.631951 | 394.985060 |
| Repaired 14, TPS, one reused diagnostic Q02 | 145.608169 | 145.608169 |
| Repaired 14, TPS, five fresh checks | 80.306054 | 1111.670765 |

Q01 → C14 and Q05 → C15 are explicit diagnostic promotions with exact pixels and coordinates unchanged. All initial twelve controls remain unchanged. Promoted points are no longer independent checks. Q02's error improves from 182.631951 m to 145.608169 m, but this single reused check does not validate the repair. Initial failures remain in [initial TPS scores](initial-tps-scores.json) and [initial affine scores](initial-affine-scores.json).

The [repair freeze](repair-freeze.json) preceded collection of fresh validation. Final fit SHA-256 `2b4a15579de38102ce6950f95f954c401e6d4b1f4266d2516e6757c8a671a997`. Fresh V03/V04 modern proposals initially selected nearby mainland/bridge geometry; before their first score they were restricted to the connected Seal/Kidston island coast components. V05 preserves the changed historic neck/current island configuration at Fraser Point. V02 and V05 were inspected again in wide native/modern context after failing; neither was moved or fitted after its score.

| Fresh check | Ground error m |
| --- | ---: |
| V01 | 65.067169 |
| V02 | 1111.670765 |
| V03 | 80.306054 |
| V04 | 53.291571 |
| V05 | 353.486200 |

| Control | Native pixel | Modern identity | Physical feature |
| --- | --- | --- | --- |
| C01 | [3087, 3053] | J0677 | Sam Brook / northern branch of Baddeck River confluence |
| C02 | [4788, 2098] | J0419 | Big Glen Brook / Christopher McLeod Brook confluence |
| C03 | [7058, 1294] | OID 10712 | Monroe Point easternmost outer coast |
| C04 | [9073, 1990] | OID 20527 | Seal Island southern tip of larger island |
| C05 | [8430, 2587] | OID 18364 | Otter Island southernmost coast |
| C06 | [2970, 3648] | J0851 | McRae Brook mouth at west bank of Baddeck River |
| C07 | [3097, 4968] | J1117 | Tom Moore Brook / Herring Brook confluence |
| C09 | [3695, 6285] | OID 18000 | Kidston Island southernmost coast |
| C10 | [5650, 6914] | OID 10801 | Kemp Head southernmost outer coast |
| C11 | [8466, 4784] | OID 5749 | Island Point easternmost outer coast |
| C12 | [8593, 6255] | OID 10899 | Lockman Point northernmost tip of hooked headland in southeastern extension |
| C13 | [4382, 6263] | OID 9447 | Red Point southernmost outer coast |
| C14 | [2981, 2059] | J0429 | Small eastern tributary at northern Baddeck branch, above Sam Brook |
| C15 | [5480, 2337] | J0482 | Pond western outlet neck south of St Anns road; modern banked outlet differs in width |

## Actual raster and browser verification

Only the repaired 14-control raster was rendered; there is no before/after raster claim. Exact GDAL TPS uses `-et 0`, cubic resampling, one complete mapped boundary and RGBA transparency. [Coverage](coverage.json) verifies 53,511,463 expected interior cells with zero transparent holes. All 79,024 sampled Jacobians have the expected negative sign for a native y-down image; range −30.764099 to −24.950126. These are structural checks only.

All 11 [actual warped frames](warped-review/frames.json) were personally inspected. Northwestern river tributaries and wider inland networks disagree substantially; local main-river confluences and several coast controls are closer. Port Bevis, Fraser/Coffin coast, inland pond outlines, and small offshore features remain inaccurate or unsupported. The full mapped southern extensions and labels are retained. Unsupported interiors and mapped sea remain extrapolation.

Both [western Sheet13 comparisons](adjacent-sheet-review/frames.json) use its latest local 11-control provisional raster, with hashed [join provenance](join-provenance.json). They show overlapping frame placement and river/shore discontinuities; no seam is accepted. The northern Sheet10 comparison awaits that sheet's physical raster.

[Import verification](import-verification.json) uses the application's real CSV parser, semantic round-trip and TPS solver. All 14 / 1 / 5 role counts pass; maximum web/GDAL prediction difference is 5.015326e−9 projected m. [Browser verification](browser-verification.json) records actual GeoTIFF import into My Maps, nonempty canvas, stored raster SHA, georeference and alpha preservation, enabled state after reload, and zero page/console errors. Desktop import/reload and mobile reload screenshots were personally inspected. This is actual raster import proof; it does not claim acceptance of a native PNG+CSV browser mesh.

[Preservation verification](preservation-verification.json) checks original grid files, all initial controls, promotions, freeze hashes, checks, source/reference files and final raster. [Frame verification](frame-verification.json) verifies all 47 personally inspected point figures against exact preserved-stage coordinates. No application behavior changed; no local Apple build was needed. Hosted CI is reported separately on the PR.

## Rights and provenance

Historical imagery credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. The original manifest attribution and null license field remain intact in the source receipt. Existing scoped direct-source permission is documented in [INVENTORY.md](../INVENTORY.md); the null manifest field is not a replacement for that permission. Historical imagery and derived review figures retain the applicable CC BY-NC-SA 3.0 boundary: noncommercial use, attribution, identified modifications and ShareAlike. These figures are cropped, annotated or georeferenced derivatives; original authorship is not claimed. No historical imagery is relicensed under the repository's software license. This local research packet is not deployment clearance.
