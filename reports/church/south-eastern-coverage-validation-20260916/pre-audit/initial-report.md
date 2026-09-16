# Inverness south: twenty-check eastern coverage milestone

**Twenty independent physical checks give 216.89 m horizontal ground RMS on the unchanged TPS13 fit.** This meets the preselected 250 m working objective on this distributed sample; the 200 m stretch objective is not met. The fit remains provisional because regional discrepancies and shared-feature seam review remain unresolved. No whole-panel geographic acceptance or replacement of the July baseline follows from reaching twenty checks.

| New check | TPS13 error m | Accepted baseline error m | Judged uncertainty m |
|---|---:|---:|---:|
| IS52 — MacIvers Point western extremum | 365.87 | 491.71 | 200 |
| IS53 — Malagawatch Point eastern extremum | 70.68 | 193.84 | 150 |

Both new points are outside the control hull. Their pair gives **263.49 m RMS**, with bias **+9.85 m east / +196.78 m north**. The cumulative median is **191.37 m**, empirical P95 **367.22 m**, maximum **392.85 m**, bias **+56.40 m east / +26.40 m north**, and scatter **207.76 m RMS** about the mean. The accepted baseline gives **411.75 m RMS** on the same twenty; its historical accepted inputs, eleven-check result and gates remain unchanged. Green Point remains the largest current error, and all earlier regional failures remain included.

Distances retain the 6,371,008.8 m sphere, mean-latitude cosine and warped-minus-reference convention. P95 is a linear sample percentile, not a confidence guarantee. Observation uncertainty is not subtracted.

## Physical matches

**IS52:** The west-facing headland has a notched northern shore, western front and southern return into MacDonald Cove. The long cove and opposing channel shore distinguish it. The engraved western front is more angular than the modern shoreline, which limits precision. Display **[616,429]** in the unrotated 1600×1600 crop at origin **[31400,15000]** gives native **[32016,15429]**. Original **WACO20 10117 v80**, **[−60.92521510390629,46.03719145893317]**, is the local western extremum. The first residual is **−44.13 m east / +363.20 m north**.

The modern name record identifies MacIvers Point in Victoria County. This adjacent shore is explicitly drawn inside the Inverness south main-map content and its frozen cutline; it is not an independent town inset. County identity and the coverage of a historical sheet are distinct. The namepoint itself is not a measured control/check coordinate.

**IS53:** The peninsula approaches from the west, curves around its eastern face into a long northwestern hook, and encloses a cove with detached islets to the northwest and a southern harbour shore. The outer-coast eastern extremum is clear away from the label. Display **[855,856]** in the unrotated 1600×1600 crop at origin **[31500,21500]** gives native **[32355,22356]**. Original **WACO20 13892 v16**, **[−60.91334405358056,45.86976565630351]**, is the eastern extremum. Its first residual is **+63.82 m east / +30.37 m north**. Interior ponds and finer coastline details are not substituted for the outer shore.

Both native crosshairs and marked exact-reference vertices were inspected before first scoring. Initial 240 m locality searches were expanded to 700 m before selecting the extrema; the smaller MacIvers search did not contain the full western front. Both neighbourhoods, the original vertices and pre-score figures remain preserved. The verifier reconstructs the expanded candidate sets from the original geometry and frozen name records. No point was moved, promoted or used to tune the fit after either first result.

## Preserved inputs and usable artifact

`freeze.json` pins selected controls, the preceding eighteen-check inventory and summary, selection freeze, and accepted baseline inputs to nightly ancestry commit **c7f0242ffab658f64e13378beb1484fc736aa9ef**. The [previous northeastern report](../south-northeast-validation-20260916/README.md) and every earlier first result remain unchanged. The cumulative CSV preserves the exact prior byte prefix.

The same 4,751×6,488 EPSG:3857 raster remains byte-identical, SHA-256 **b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040**. Actual-raster/reference windows show the northward MacIvers discrepancy and smaller Malagawatch offset; both source points have nonzero alpha. Prior full-content alpha and sampled-distortion receipts still apply. The overview shows thirteen controls and twenty fresh reference positions across coast, interior, northern and southern extensions, with remaining regional limitations.

The persisted TPS13 raster was the only active historical raster at 70% opacity in 2D and **10× terrain, north-up, 50° tilt** review. Modern map was enabled. Browser captures and DOM receipts are indexed in `browser-review.json`. Terrain supplies landscape context; all observation coordinates come from native scan and original vector geometry. No new import or raw-scan mesh acceptance is claimed.

## Verification and next panel

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-eastern-coverage-validation-20260916/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays both first scores, cumulative twenty, new pair and preserved eighteen. It checks frames, original extrema and their candidate sets, hashes, raster evidence and browser receipts. Three editable inventories round-trip through the production parser and compare TPS with GDAL at checks and content vertices. Use frozen caches; acquisition/adoption scripts are archival recipes.

With this twenty-check sample preserved, resume the requested sequential pass at **Richmond**. Retain the South TPS13 artifact and regional errors for later seam review. MacIvers Point may provide a shared feature with Victoria main, but its native location on that other sheet must be independently identified first. Any later refinement must preserve these first results, relabel consumed checks as diagnostics and obtain fresh validation after a new freeze. The full multi-panel georeferencing objective remains incomplete.

No catalog activation, tiles or deployment follows. Source imagery retains David Rumsey / Stanford attribution and recorded CC BY-NC-SA 3.0 terms; provincial reference and Mapzen terrain provenance remain intact.
