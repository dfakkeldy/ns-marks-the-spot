# Inverness south: eastern checks and MacIvers correspondence audit

**Nineteen untouched fresh checks give 206.09 m horizontal ground RMS on the unchanged TPS13 fit.** A separate inventory adds the corrected MacIvers corner, giving **207.53 m RMS across twenty held-out checks**. That twenty-check inventory includes one corrected-reference diagnostic; it is not an untouched twenty-check first validation. Both aggregates meet the 250 m working objective on their stated samples, while the 200 m stretch objective remains unmet. Regional errors and full seam review remain unresolved.

| Current phase | Count | RMS m | Median m | Empirical P95 m | Maximum m | Mean east / north m |
|---|---:|---:|---:|---:|---:|---:|
| Untouched fresh | 19 | 206.09 | 190.28 | 331.52 | 392.85 | +61.69 / +8.67 |
| Fresh plus corrected reference | 20 | 207.53 | 191.37 | 328.11 | 392.85 | +55.60 / +19.50 |

Scatter about the mean is 196.45 m and 198.99 m RMS respectively. The accepted baseline gives 407.11 m on the same nineteen and 404.77 m on the corrected twenty. Its historical accepted inputs, eleven-check result and gates remain unchanged. Distances retain the 6,371,008.8 m sphere, mean-latitude cosine and warped-minus-reference convention. P95 is a linear sample percentile, not a confidence guarantee; observation uncertainty is not subtracted.

## Correction, with the first failure preserved

The initial IS52 point paired native **[32016,15429]** with **WACO20 10117 v80**, the modern westernmost vertex. It gave **365.87 m** error. During the cross-panel audit, the existing [Victoria VM27 record](../victoria-main-continuation-20260914/observations/VM27.json) revealed that the source pixel instead marks the **northern corner of the western face**, below a north-facing recess. VM27 had already explicitly distinguished that corner from the westernmost vertex farther south.

Both source crops and the original reference geometry were re-inspected. The shared corner is **10117 v62**, **[−60.925008415397436,46.038431573009426]**. The original v80 reference lies 138.81 m from it. This is a feature-definition correction supported by existing evidence, not a source-pixel adjustment to reduce residuals. The native point, 200 m stated uncertainty, controls and raster are unchanged. The corrected South residual is **−60.09 m east / +225.30 m north**, or **233.18 m**.

`observations/IS52.json` and `IS52-first.json` remain byte-preserved. `IS52-corrected.json` and `IS52-reference-audit.json` carry the corrected definition and its phase. The initial twenty-row inventory, 216.89 m aggregate, initial pair scores, plots, receipts and unpublished report are preserved in `first-twenty*`, `first-new-checks.csv` and `pre-audit/`. Their unqualified twenty-fresh-check claim is retired. Active `fresh-validation.csv` contains the preceding eighteen checks plus unchanged IS53; `corrected-validation.csv` adds corrected IS52 separately.

IS52's source frame is an unrotated 1600×1600 crop at **[31400,15000]**, with display point **[616,429]**. The modern name record identifies adjacent Victoria County shoreline that is explicitly drawn in this Inverness south main-map content and frozen cutline; it is not a town inset. The source front is more angular than the modern shoreline. Both regional geometry and point-definition limits remain relevant.

## Unchanged new check: Malagawatch Point

IS53 uses the eastern outer-coast extremum of the peninsula that curves into a long northwestern hook, with the enclosed cove, detached northwest islets and southern harbour shore in the same sequence. Display **[855,856]** in the unrotated 1600×1600 crop at **[31500,21500]** gives native **[32355,22356]**. Original **WACO20 13892 v16** is **[−60.91334405358056,45.86976565630351]**. Its untouched first error is **70.68 m** (+63.82 m east / +30.37 m north), compared with 193.84 m for the accepted baseline. Its judged uncertainty remains 150 m.

The source crosshair and exact-reference marker were inspected before first scoring. The initial 240 m namepoint searches and expanded 700 m coast neighbourhoods are preserved; namepoints were not measurement coordinates. Both new source positions lie outside the South control hull.

## Shared MacIvers corner and actual rasters

The existing Victoria VM27 native point is **[16172,25055.333333333332]**. Under unchanged corrected Victoria TPS14 it gives 67.48 m error at the shared corner. South minus Victoria is **−47.81 m east / +158.95 m north**, a **165.98 m model-to-model separation**. VM27 is an existing Victoria selection diagnostic, not new fresh validation. One paired corner is not an independent seam RMS or whole-seam acceptance.

`seam-inputs.json` pins the Victoria observation, controls, freeze and artifact receipt to the same nightly ancestry as the South inputs. `seam-review/` compares actual frozen raster windows; both measured pixels have nonzero alpha. South remains the 4,751×6,488 EPSG:3857 raster with SHA-256 **b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040**. Victoria remains the 4,081×5,859 corrected TPS14 raster with SHA-256 **3fb0ece4147593efc8f5dbd6dfae8f4159b5ed6e668779ce8e862e078ead3ac3**. Earlier full-content and sampled-distortion receipts apply to those unchanged bytes.

The South controls and preceding eighteen-check inventory/summary are pinned by `freeze.json` to nightly commit **c7f0242ffab658f64e13378beb1484fc736aa9ef**. The [preceding northeastern report](../south-northeast-validation-20260916/README.md), first results, accepted baseline and fits remain unchanged. The active coverage plot marks corrected IS52 separately from the nineteen untouched fresh points.

## Verification and continuation

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-eastern-coverage-validation-20260916/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays the original and corrected phases, original reference-vertex neighbourhoods, frozen inputs, source frames, paired predictions and actual raster evidence. Five editable inventories round-trip through the production parser and compare TPS with GDAL. Use frozen caches; `pre-audit/` and acquisition/adoption scripts preserve history and are not the active replay entry point. Browser captures and DOM receipts distinguish the original review from the corrected shared-corner comparison. Both frozen rasters were inspected separately at 70% opacity in 2D and 10× terrain at the corrected corner; South was restored as the sole active historical layer. Console inspection returned no errors. All nineteen metric sets replayed, five parser/solver inventories passed, and all 428 Church tests passed. Terrain is context, never a source of measurement coordinates.

Resume the requested sequential pass at **Richmond**, retaining the South fit, reference correction, Green Point's 392.85 m error and remaining seam limits. Future fitting that consumes these checks must retain their first results and obtain fresh validation after a new freeze. The full multi-panel georeferencing objective remains incomplete. No whole-panel acceptance, catalog activation, tiles or deployment follows. Source imagery retains David Rumsey / Stanford attribution and recorded CC BY-NC-SA 3.0 terms; provincial reference and Mapzen terrain provenance remain intact.
