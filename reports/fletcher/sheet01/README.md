# Fletcher Sheet 1 — provisional complete-sheet georeferencing

**Draft / whole-sheet geography unaccepted.** Two fresh checks fail both limits: median **364.528849903 m**, worst **457.395051281 m**, against required 100 m median / 200 m worst. Actual raster review also shows displaced coasts, drainage and neighbouring seams. Production eligibility remains false.

## Source, extent and reference

The [Rumsey manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2626~280040/manifest) identifies Sheet 1, `RUMSEY~8~1~2626~280040`, native 10874 × 7680. All 24 acquired regions passed assembled-pixel parity. PNG SHA `ee65feacee038b3f57804b3e88ceedba38bc810682faa79d305ea8000c9130a3`. [source-receipt.json](source-receipt.json) retains TIFF and manifest hashes and the null manifest licence field.

Credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. Existing scoped direct-source permission is documented in [the Fletcher inventory](../INVENTORY.md). CC BY-NC-SA 3.0 requires attribution, noncommercial use, identification of changes and ShareAlike. The null manifest field remains distinct from the permission record. These derivatives are georeferenced and annotated; imagery is not relicensed under repository MIT terms. Hosting clearance is separate.

The native overview, four corners, all coordinate labels and red boundary were personally inspected. One continuous ring retains the complete mapped frame, broad northern sea, interior legend, Cape St Lawrence, Cape North, ponds and offshore rocks. No outside mapped extension was identified. Unsupported areas remain visible; no control-hull clipping. Boundary SHA `5585bf075453859428c58bd66e64066f58a1274aad08f89eb97954809b21f910`.

Two original grid-only files remain unchanged; no earlier physical packet was found in the recorded search scope ([prior-state.json](prior-state.json)). Their longitude labels were wrong by five minutes: native labels are **60°40′/35′/30′/25′ W**, with **47°05′/00′ N** parallels. All four longitude labels and both latitude labels were personally inspected. [search-guide.json](search-guide.json) corrects only meridians while retaining all eight prior slanted crossing pixels. Crossings were not remeasured and are search guidance only, never physical controls. [guide-audit.json](guide-audit.json) preserves the earlier source encoding hash.

The original reference extraction based on that erroneous grid, bbox −60.90, 46.93, −60.42, 47.15, remains preserved with its receipts and external files. Corrected expanded NSTDB bbox −60.80, 46.93, −60.30, 47.15 returned 326 roads, 1,391 water lines and 428 water polygons. Rail returned empty (0), not evidence of absence. [reference-receipts.json](reference-receipts.json) retains URLs, retrieval dates, counts and hashes. Three personally inspected native/modern search pairs and the modern node index are in [matching-context](matching-context/).

## Reviewed identities and frozen repair

All initial and corrected crosshairs were personally inspected before fitting. Seven initial controls are Cape St Lawrence's northern mainland tip, historical Lowland Brook mouth and eastern tributary junction, Black Point's northern mainland tip, Cape North's northern mainland tip, Money Point's eastern mainland tip and Wreck Cove Brook mouth. Historical Lowland Brook is matched to modern French Brook by cape/channel geometry; the different name is an explicit identity inference. Four modern coastal extremes were checked against their complete chosen segments, avoiding clipped selections and offshore rocks. Historical coast and channel widths remain uncertain. C08's McDougall Pond southern shoreline proposal remains **rejected and unscored**: the broadly recognizable waterbody does not establish a matching modern vertex on its irregular shore.

Seven controls were frozen at SHA `3a99982a376d5768097ea5b146dda9a0a9de957fbb7fd868b22e2890ebf3a3db` before diagnostics. Q01's proposed Salmon River western tributary remains **rejected and unscored**: historic and modern branch directions differ. Q02 is the northern Lowland Cove stream mouth, corrected from [3870, 4610] to [3908, 4594] after native/modern review and before scoring. Its historical short stream differs from the longer modern course.

| Initial Q02 diagnostic against seven controls | Ground error m |
|---|---:|
| Affine | 269.063410637 |
| TPS | 500.650476682 |

The failed initial fit and score remain intact. Q02 was promoted to C09 with exactly the same native and world coordinates; all seven earlier control records remain unchanged. The eight-control repair was frozen at SHA `4dbb3c414a96a7a3a7a547b2c837e601aa6a9a7e68387f46e43415c2611c9daa` before collecting fresh validation ([final-freeze.json](final-freeze.json)). Q02 is no longer held out. No independent reused diagnostic remains after that promotion.

Fresh V01's southern Lowland Cove mouth proposal remains **rejected and unscored** because stream direction and the sequence of additional modern mouths are unresolved. Fresh V02 is Gulch Brook's northern bank/coast junction. Its original modern terminal-channel choice lay approximately 130 m inland where the two banks begin; before any fresh score, this was corrected to coast vertex 48 of feature 26052, with native pixel [8405, 5406]. The original modern selection and reason are preserved. Fresh V03 is Low Fall stream mouth south of Lowland Cove, corrected to native [3549, 5044]. Shoreline generalization remains explicit. All proposal, wide and corrected crosshairs were personally inspected before scoring.

| Fresh check | Ground error m |
|---|---:|
| V02 | 271.662648524 |
| V03 | 457.395051281 |

Fit and validation coordinates remain unchanged after scoring. All **36 point frames** were personally inspected; [frame-verification.json](frame-verification.json) checks their metadata against preserved-stage coordinates. Pending-review language in immutable proposal files describes their creation stage, not final review status.

## Deliverables and actual rendered evidence

- [Editable final controls](sheet-01-controls.csv): 8 controls.
- [Initial diagnostic CSV](sheet-01-diagnostic-review.csv): original 7 controls plus Q02, preserving the failed experiment.
- [Fresh validation CSV](sheet-01-validation-review.csv): final 8 controls plus 2 fresh checks. Checks do not constrain fitting.
- Complete external GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet01/regional-eight/sheet-01-full-sheet.tif`, 8988 × 5412 RGBA, SHA `50fe7caa175899f9e98667992346326d6e70f8274832b5423a94b314db1b234f`.
- Native image: `/Users/dfakkeldy/Downloads/fletcher-sheet01/native/sheet01.png`. Large source, reference GeoJSON and raster files remain outside Git.

One exact GDAL TPS (`-et 0`), cubic resampling, EPSG:3857 and 5 projected metre cells produced the complete raster. Coverage found 43,871,731 interior cells and zero alpha holes. All 71,625 sampled Jacobians have the expected negative sign. These are rendering-integrity checks, not geographic acceptance.

The actual web parser semantically round-trips all three CSVs. Each experiment is compared with its matching frozen fit; maximum web/GDAL prediction difference is 3.83994134666e-09 projected metres. Actual My Maps GeoTIFF import, desktop reload and mobile viewing succeeded in isolated Chromium. Stored raster bytes/hash, georeference, dimensions, transparency and enabled state survived reload, with no console/page errors. All three screenshots were personally inspected; external paths and hashes are in [browser-verification.json](browser-verification.json). This is local verification, not deployment.

Eight actual raster frames were inspected. Cape St Lawrence and fitted French Brook features are locally closer, but the cape's eastern shore and upstream channel geometry diverge. The promoted northern Lowland Cove mouth is locally closer while Low Fall and the High Capes coast are increasingly displaced to the southwest. Black Point fits locally, but Meat Cove's inland channels and the coast towards Cape St Lawrence diverge. Wreck Cove mouth fits locally while the Salmon River, estuary, McDougall Pond shore and interior remain displaced. Cape North and Money Point fit locally; intervening coast, cape width and offshore rocks differ. The Gulch Brook mouth misses and the coast south of Money Point diverges. Southern drainage is unsupported and displaced. The complete northern sea remains visible as unsupported extrapolation.

Three actual adjacent comparisons were inspected. Both southern Sheet 3 comparisons show differing boundary tilt and gaps/overlap, with shore and drainage continuations unaccepted. The southeast Sheet 2 comparison shows a gap and coastal placement disagreement. Sheet 2 covers a southeast portion, not a full-width southern neighbour. No join is accepted. [join-provenance.json](join-provenance.json) pins the actual rasters. These comparisons also resolve the outstanding Sheet 1 comparison recorded in Sheet 2's earlier packet.

## Handoff

Keep Sheet 1 fail-closed. Preserve the failed fresh checks, failed original Q02 experiment, all rejected proposals, seven unchanged earlier controls and exact promotion. Further work needs supported interior and southern coast identities and distributed independent validation. Broad sea cannot provide physical checks. Freeze any future repair before collecting new checks; existing validation then becomes diagnostic. Preserve the corrected longitude-label evidence without rewriting the original grid files.

Local provenance, coverage, CSV and actual browser checks passed. Fresh numerical thresholds and **whole-sheet geographic acceptance failed**. Hosted CI is reported separately on the PR. Shared render/score/coverage and web code remain unchanged. No merge, deployment or publication was performed.
