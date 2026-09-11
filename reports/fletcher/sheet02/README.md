# Fletcher Sheet 2 — provisional complete-sheet georeferencing

**Draft / whole-sheet geography unaccepted.** Two fresh local coastal checks pass the 100 m median / 200 m worst limits: median **89.429010448 m**, worst **105.244390334 m**. They do not validate the ponds, inland drainage, broad sea or joins. Actual raster review shows displacement outside fitted locations. Production eligibility remains false.

## Source, extent and reference

The [Rumsey manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2627~280041/manifest) identifies Sheet 2, `RUMSEY~8~1~2627~280041`, native 10829 × 7582. All 24 acquired regions passed assembled-pixel parity. PNG SHA `b4094db3ab94e60e3f30727c7edb97d6ac66e19a7e640c3a5ce3b339b91e1922`. [source-receipt.json](source-receipt.json) retains TIFF and manifest hashes and the null manifest licence field.

Credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. Existing scoped direct-source permission is documented in [the Fletcher inventory](../INVENTORY.md). CC BY-NC-SA 3.0 requires attribution, noncommercial use, identification of changes and ShareAlike. The null manifest field remains distinct from the permission record. These derivatives are georeferenced and annotated; imagery is not relicensed under repository MIT terms. Hosting clearance is separate.

The native overview, four corners, coordinate labels and red boundary were personally inspected. The single ring retains the complete mapped frame, broad eastern sea, interior legend, North/Middle/South Pond portions, White Point islands and offshore rocks. No outside mapped extension was identified. Unsupported areas remain visible; no control-hull clipping. Boundary SHA `615e4edbf4593f906f996a9b7a5ebff3d8b78d5fcbd3055d00f11883e02268a1`.

Two original grid-only files remain unchanged; no earlier physical packet was found in the recorded search scope ([prior-state.json](prior-state.json)). Eight prior slanted crossings at 60°25′–60°10′ W and 46°55′/46°50′ N provide search guidance only. Native latitude and outer longitude labels were rechecked; individual crossings were not remeasured. [guide-audit.json](guide-audit.json) preserves the earlier source encoding hash.

NSTDB bbox −60.50, 46.77, −60.02, 47.00 returned 804 roads, 1,750 water lines and 662 water polygons. Rail returned empty (0), not evidence of absence. [reference-receipts.json](reference-receipts.json) retains URLs, retrieval dates, counts and hashes. Two personally inspected native/modern search pairs and the modern node index are in [matching-context](matching-context/).

## Reviewed identities and frozen repair

All initial and corrected crosshairs were personally inspected before fitting. The initial eight controls are Pollys Brook mouth, Cape Egmont eastern tip, White Point mainland northern tip, Black Head northern tip, Neils Head eastern tip, Neils/Rachel confluence and two Halfway Brook junctions. Original proposals remain separate. Native corrections moved points off roads, sea or channel arms onto their intended features. Black Head's original modern selection clipped the headland's northern edge; the corrected point uses the northernmost vertex of complete mainland coast segment 2829. White Point's mainland control is separate from its offshore islands. Historical widths, branch lengths and shoreline detail differ; 20 native pixels of source uncertainty are recorded.

Eight controls were frozen at SHA `530a19b70f7095d6690a15bf726df44bf6599e5ae36441917d667a0b1ca28276` before diagnostics. Q01 is Trout Brook's shoreline mouth at Hungry Cove / New Haven. The original pixel [4567, 5440] was corrected to [4568, 5453] and personally inspected before scoring. Q02's proposed Neils Brook tributary remains **rejected and unscored**: the historical short northern branch does not establish the modern long western branch / divided channel geometry.

| Initial Q01 diagnostic against eight controls | Ground error m |
|---|---:|
| Affine | 412.525733826 |
| TPS | 322.877598722 |

The failed initial fit and score remain intact. Q01 was promoted to C09 with exactly the same native and world coordinates; all eight earlier control records remain unchanged. The nine-control repair was frozen at SHA `3094eec05b4adec75eaaea85a19c3349f2ab9d2d45963359533d7d86a2917c6a` before collecting fresh validation ([final-freeze.json](final-freeze.json)). Q01 is no longer a held-out check. No independent reused diagnostic remains after that promotion.

Fresh V01 is the northern tip of White Point's largest offshore island. Its full connected modern shoreline component is 14622, 16918 and 22162; this avoids accidentally selecting a smaller rock or truncated segment. V02 is the brook mouth immediately east of Black Head. Their proposal pixels were corrected after close/wide review, before scoring, to [3778, 3263] and [2696, 3728]. Final crosshairs were personally inspected. Island width and shoreline/channel generalization remain explicit limitations.

| Fresh check | Ground error m |
|---|---:|
| V01 | 105.244390334 |
| V02 | 73.613630562 |

Fit and validation coordinates remain unchanged after scoring. All **35 point frames** were personally inspected; [frame-verification.json](frame-verification.json) checks their metadata against preserved-stage coordinates. Pending-review language in immutable proposal files describes their creation stage, not final review status.

## Deliverables and actual rendered evidence

- [Editable final controls](sheet-02-controls.csv): 9 controls.
- [Initial diagnostic CSV](sheet-02-diagnostic-review.csv): the original 8 controls plus Q01, preserving the failed experiment.
- [Fresh validation CSV](sheet-02-validation-review.csv): final 9 controls plus 2 fresh checks. Checks do not constrain fitting.
- Complete external GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet02/regional-nine/sheet-02-full-sheet.tif`, 9094 × 6131 RGBA, SHA `ec5096c078ea3628b00f39ef28a9475f641bbd0daa0db19a2c24f655143a1465`.
- Native image: `/Users/dfakkeldy/Downloads/fletcher-sheet02/native/sheet02.png`. Large source, reference GeoJSON and raster files remain outside Git.

One exact GDAL TPS (`-et 0`), cubic resampling, EPSG:3857 and 5 projected metre cells produced the complete raster. Coverage found 51,820,504 interior cells and zero alpha holes. All 71,200 sampled Jacobians have the expected negative sign. These are rendering-integrity checks, not geographic acceptance.

The actual web parser semantically round-trips all three CSVs. Each experiment is compared with its matching frozen fit; maximum web/GDAL prediction difference is 3.83994134666e-09 projected metres. Actual My Maps GeoTIFF import, desktop reload and mobile viewing succeeded in isolated Chromium. Stored raster bytes/hash, georeference, dimensions, transparency and enabled state survived reload, with no console/page errors. All three screenshots were personally inspected; external paths and hashes are in [browser-verification.json](browser-verification.json). This is local verification, not deployment.

Seven actual raster frames were inspected. Pollys Brook mouth fits locally, but adjacent channels differ. The North/Middle/South Pond shorelines and islands are displaced, and the historical harbour/barrier geometry differs. Black Head is locally closer, while inland tributaries and surrounding coastal detail diverge. White Point mainland is locally closer, but its offshore island is much wider in the historical map and the eastern coast is displaced. Cape Egmont and the fitted Trout mouth are locally closer; the intervening coast and upstream drainage differ. Neils/Rachel and Halfway junctions fit locally while other branches and the coast south of Neils Harbour diverge. The full frame retains all mapped geography and the broad unsupported eastern sea.

Four actual adjacent comparisons were inspected. Western Sheet 3 has inconsistent boundary placement, northern edge alignment, pond shapes and river continuation relative to Sheet 2. Southern Sheet 4 has differing boundary tilt and gaps/overlap, with coastal placement unresolved. The southern sea comparison shows boundary placement only; it cannot establish a physical seam. No join is accepted. A northwest comparison with Sheet 1 remains pending; Sheet 1 is not a claim of a full-width northern neighbour.

## Handoff

Keep Sheet 2 fail-closed. Preserve its passing local fresh checks, failed original Q01 experiment, rejected Q02, eight unchanged earlier controls and exact promotion. Further work needs supported pond/island and interior identities, distributed independent validation, and the Sheet 1 comparison. Freeze any future repair before collecting new checks; existing validation then becomes diagnostic.

Local provenance, coverage, CSV and actual browser checks passed. Fresh numerical thresholds passed for two coastal checks; **whole-sheet geographic acceptance failed**. Hosted CI is reported separately on the PR. Shared render/score/coverage and web code remain unchanged. No merge, deployment or publication was performed.
