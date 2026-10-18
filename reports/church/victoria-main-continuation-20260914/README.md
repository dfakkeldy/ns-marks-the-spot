# Victoria main: correct a false island match and preserve the full-content review

The selected provisional result is a **fourteen-control TPS with the wrong Stony Island correspondence excluded**. Six valid model-selection diagnostics measure **284.92 m horizontal ground RMS**, above the 250 m working target. One later fresh check, Crow Point, measures **64.46 m**. That single nearby check does not establish whole-panel accuracy. Full georeferencing remains incomplete; this is a review artifact with explicit limitations.

The critical correction is categorical: the historical **Stony Island (VM12)** had been matched to a **mainland pond** made from original NSTDB `WALK20` features 60256 and 60257. The source is an island in the channel. Every recorded modern exterior vertex belongs to lake shoreline, with none supported by marine-island geometry. A low model score cannot justify that match. The original observation, first scores, subsequent trials and rejected rasters remain intact. No substitute location was guessed for the historical island.

The corrected review also retains western, southern and eastern mapped content that the production cutline clipped, excludes the independent Baddeck inset and removes title space. Production inputs, existing accepted baselines, catalog activation and deployment remain unchanged. The earlier main-panel longitude-anchor correction remains in place: 60°40′ is meridian index 1; no additional −10′ shift was applied.

## Current numerical evidence

All distances below are horizontal ground metres, warped source minus reference. P95 is an empirical linear sample percentile, not a confidence limit. Observation uncertainty is recorded per feature and is not subtracted from residuals.

| Set | Count | RMS | Median | P95 | Maximum | Mean east / north |
|---|---:|---:|---:|---:|---:|---:|
| Original affine4, same valid diagnostics | 6 | 705.86 | 595.46 | 1033.64 | 1058.75 | -23.46 / +71.38 |
| Corrected TPS14, selection diagnostics | 6 | 284.92 | 271.14 | 426.42 | 452.94 | +24.05 / +21.42 |
| Corrected TPS14, new Crow Point check | 1 | 64.46 | 64.46 | 64.46 | 64.46 | +63.79 / -9.28 |

The six diagnostics are Wreck Cove Brook, Gillis Point, Benacadie Point, MacPherson Point, MacIvers Point and MacDonald Brook. They were used in model selection and are not fresh validation. The principal remaining residual is the MacDonald Brook/North River junction, approximately 453 m inside the control hull. Gillis and MacPherson also remain above 300 m. Their identities and source pixels were not moved to improve those scores.

Crow Point VM29 was selected and measured after the corrected TPS14 freeze, remains unfitted, and checks the local mainland geometry near the problematic St Patricks Channel area. It has 140 m stated observation uncertainty. More distributed coast, interior, northern-extension, western-edge and seam checks are still required; the requested 20–30-check aim has not been met. Existing points and contacts near the same islands or tributary complex do not supply independent regional coverage.

## Correspondence audit and preserved experiments

`stony-island-correspondence-audit/decision.json` records the VM12 rejection and the actual source island context. The other original marine-island controls/checks were audited against their stored exterior vertices: Kidston, Hume, Ciboux, Hertford and Bone all have complete marine-island exterior support. Kidston and Ciboux metadata also list lake-shoreline IDs for interior holes; those are not part of their recorded exterior rings. The audit therefore checks the exterior itself rather than rejecting every mixed feature-ID list.

No valid replacement for Stony Island was established in the inspected reference neighbourhood. This is a correspondence/coverage limitation, not proof that the island disappeared. Its old coordinate is excluded from all current controls and diagnostics, including aliases. Any candidate using VM12 as a control is rejected for geographic use. Early check sets that included VM12 as a check also cannot be treated as valid geographic aggregates, even though their arithmetic remains reproducible.

The retained history is deliberately explicit:

- `affine4-controls.csv` preserves the original four physical controls. VM17, MacLeods Brook's coastal outlet, first failed at 1,180.19 m outside their hull. The native river-to-coast point is separate from the nearby pond, road and property labels.
- `northern-support-trial/`, `interior-support-trial/`, `lake-support-trial/` and `baddeck-support-trial/` preserve affine, quadratic and TPS comparisons. VM18, the West/Middle Branch North River interfluve, and VM19, the Baddeck Forks mouth centre, were prospective controls selected before testing their effects. The old McLeod Lake promotion experiment remains untouched in the predecessor report.
- `regional-tps11/` preserves a broader candidate and the first results of Peters Brook VM20 (277.64 m), Wreck Cove Brook VM21 (207.01 m) and Gillis Point VM22 (635.22 m). The first two alone had 244.89 m RMS; adding the southern check raised it to 417.71 m. No later report presents the two-point subset as whole-panel acceptance.
- `southern-support-trial/`, `southern-island-support/` and `central-river-support/` preserve subsequent trials. The southern shore pond VM23 was a prospective control, not a fresh check. Bone and Peters were promoted unchanged in separate trials, with first and later failures preserved. The resulting TPS14's fresh Benacadie VM24 and MacPherson VM25 scores were 71.15 and 110.76 m, followed by Munro VM26 failing at 1,036.19 m. That three-check phase had 603.06 m RMS.
- `VM08-identity-audit.json` independently confirms the McLeod Lake match: official MacLeods Lake CAWXU lies within the recorded original lake ring, and original Christopher MacLeod Brook starts at its southern outlet. Other same-named lakes are excluded. No lake coordinate was changed during this audit.
- `harbour-support/` preserves the fifteen-control candidate after Munro was promoted. New MacIvers VM27 and MacDonald VM28 checks measured 122.41 and 473.93 m, respectively (346.11 m RMS). Its actual raster/reference windows exposed the Stony Island versus mainland-pond mistake. Those windows remain in `rejected-tps15-warped-review/` with an explicit rejection record.
- `reference-correction/` removes VM12 and changes no other control coordinate. Its six-check comparison includes the unchanged prior first observations, now diagnostic. The rejected fifteen-control fit had a lower apparent score on those six (236.39 m RMS), but retained a known wrong correspondence. The valid fourteen-control TPS is selected for further review; its 284.92 m diagnostic RMS is reported without relaxing the target.

Every promotion, exclusion and first-check result remains in its phase folder. The current 14 controls are VM01, VM02, VM06, VM11, VM17, VM18, VM08, VM19, VM10, VM15, VM23, VM07, VM20 and VM26. VM12 is excluded. VM21, VM22, VM24, VM25, VM27 and VM28 are diagnostics. VM29 is the only current fresh check.

The other withheld searches remain documented. The coastal pond north of MacLeods Brook was not equated with a larger pond across intervening drainage. Broad source context and original feature classes also corrected the initial search description of VM23: it is a pond on the inland side of Pipers Cove, not an island. Its shape/size uncertainty is retained; it is not silently equated with the separately named Pipers Cove Pond farther northwest. Name points locate candidates and corroborate identity; they are never used as fitting coordinates.

## Centroid arithmetic correction

`centroid-arithmetic-audit/` records loss of precision when unshifted geographic coordinates enter the shoelace formula for small polygons. VM23's initial, unscored reference centroid differed by 3.52 m from a translated-coordinate calculation. The corrected calculation agrees with Shapely to 1e−12 degrees and was adopted before any fit or score using VM23. Its original unscored observation, ring and source pixels are preserved. The old frozen main-panel observations differ by at most 7.57 m under this comparison; they and the shared helper remain unchanged. These metre-scale differences do not explain the hundreds of metres of regional displacement.

## Full-content artifact

Selected local GeoTIFF:

`/Users/dfakkeldy/Downloads/church-victoria-main-continuation-20260914/corrected-tps14-rendered/victoria-main-corrected-tps14-review-20m.tif`

- SHA-256: `3fb0ece4147593efc8f5dbd6dfae8f4159b5ed6e668779ce8e862e078ead3ac3`.
- 4,081 × 5,859 pixels; EPSG:3857, 20 projected-metre cells. Cell spacing is not positional accuracy.
- Original Victoria TIFF: 33,711 × 31,468; SHA-256 `81a694ed1cd7a9b3b7d77c4b16dd947a984932214397f319cab072375f695621`.
- 17,843,007 tested interior cells, zero transparent holes, one output-cell boundary tolerance.
- 35,176 orientation samples, no sampled sign reversals; maximum sampled anisotropy 1.6633. Finite samples do not prove the continuous surface fold-free or geographically accurate.
- `warped-review/` contains actual selected-raster windows at the recorded valid features, with controls, selection diagnostics and fresh checks clearly labelled. Matching a fitted centroid does not establish the accuracy of an entire island or lake outline.

`boundary-review/` preserves the first clipped proposal and the corrected second proposal. Native corner crops corrected the Whycocomagh shore separator and the sloping Baddeck inset edge; the latter avoids clipping the Maclean Beach approach. `boundary-decision.json` adopts the second proposal's geometry unchanged for review. The original boundary file retains its earlier draft wording as frozen input; the later decision establishes its selection. The envelope restores 74,131,892.62 native square pixels and removes 26,520,780.12 compared with production. It includes conservative margin/border ink and is not a claim that every engraved neatline was traced precisely.

All large source scans and GeoTIFFs stay outside Git. Affine4 and the rejected TPS11, TPS14 and TPS15 artifacts/receipts are retained. The late SSH disconnect on the TPS15 run was checked against remote files and process state: the completed receipt and raster were present, no matching renderer was running, and the copied raster matched its receipt. It was not restarted merely because the connection failed.

Historical imagery retains David Rumsey Map Collection / Stanford Libraries provenance and recorded CC BY-NC-SA 3.0 terms. Original NSTDB references retain their IDs, exact coordinates, file hashes and query receipts; the existing complete Cape Breton extract supplies southeast coverage absent from the merged search cache. A merged cache's overall bounding box does not establish continuous coverage within it. No new publication clearance, tiles, catalog activation or deployment is inferred from this report.

## Actual browser and production importer

The corrected GeoTIFF was imported through My Maps and retained after reload. Its full extent and the Crow Point and North River regions were inspected in 2D and at the requested 10× terrain exaggeration, with 50° tilt. `browser-review/` contains the captured views and receipt; the inspected error log was empty. The UI reports a large file displayed at reduced resolution. The source stays local to the browser.

The production GeoTIFF decoder reads the original 4,081 × 5,859 pixels and produces a 2,853 × 4,096 preview with alpha. Its 81 embedded projection nodes agree with the GeoTransform within 0.001 projected metre. The current three point inventories round-trip through the production web parser with 14 controls and 0/6/1 checks; the web TPS agrees with GDAL at the tested check and content-boundary samples within 0.001 projected metre. These are embedded-raster and solver checks, not raw-scan browser TPS mesh acceptance. The Node probe stubs PNG writing; the separate actual browser exercise covers import and rendering.

Strong terrain exaggeration makes ridges and valley context easier to inspect, but can obscure valley bottoms in oblique views. It supplies no new GCP coordinates or independent horizontal validation. The observed North River discrepancy remains in the report.

## Reproduction and remaining work

The report-scoped Git attributes preserve the original CRLF CSV bytes used by the recorded freeze hashes while retaining readable diffs. Coordinates and historical receipts are not rewritten merely to normalize line endings.

With the recorded local crop/reference/raster cache available, run from the repository root:

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/victoria-main-continuation-20260914/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The local verification replays 82 stored metric sets, audits 13 new observations and parses 28 inventories; all 428 Church tests pass. The verifier checks source/frame and reference coordinates, source/reference/freeze hashes, role separation, the wrong-pond exclusion, valid marine-island exteriors, unchanged predecessor inputs and actual raster receipts. `render_review_windows.py` reproduces the selected raster windows; the rejected fifteen-control renderer remains separate. Production web parser/solver and embedded-raster probes have their own scripts and receipts, separate from geographic acceptance.

The current result remains provisional. The North River interior discrepancy, remaining southern/western coverage, northern extension and seams need more independent physical evidence. Preserve this corrected correspondence set and the failed history while continuing the county-panel work; do not activate the unsupported catalog layer from a script, browser or CI success.
