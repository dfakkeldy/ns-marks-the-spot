# Inverness south: distributed-control TPS refinement

**TPS13 is a provisional review fit, with zero fresh checks after selection.** It uses thirteen unchanged physical observations, retains the full south-panel content boundary, and has been rendered and imported into the web map. The accepted July inputs, gates and artifact remain unchanged. No catalog activation, tiles or deployment follows.

The preceding affine4 validation phase closed at fourteen checks with **321.75 m ground RMS**, above the 250 m working target. Its first observations, failures and aggregates are preserved in [the closed validation report](../south-validation-20260915/README.md). Using them to select the fits below consumes their independence for these new fits. No source or reference coordinate was moved to reduce residuals.

## Explicit trials and selection

The initial distributed trial retains IS01, IS02, IS05 and IS11, and promotes IS19, IS21, IS24, IS25, IS26, IS27 and IS15. These add western coast, southwest lake, central river, northern lake/road and Ainslie outlet support. The eleven-control TPS gives 233.98 m RMS on sixteen remaining diagnostics, with a 515.14 m maximum at Skye IS18 and 433.40 m at MacNeil IS20. The corresponding affine11 gives 260.22 m RMS. Every trial remains in `comparison.json`.

A separate thirteen-control trial adds unchanged IS18 and IS20, explicitly constraining those two verified physical locations. Their original failures and eleven-control scores remain recorded, and both are removed from subsequent checks. All promoted-feature aliases are excluded. `training-inputs.json` pins original observations to nightly commit `a38e8f6b7bd377fa5e4eb89a6659ec8e749530de`; `role-history.json` records the transitions.

| Fit | Same fourteen remaining diagnostics: RMS m | Maximum m |
|---|---:|---:|
| Original affine4 | 237.12 | 462.37 |
| Distributed TPS11 | 173.76 | 270.27 |
| Distributed affine13 | 262.35 | 451.98 |
| Provisional TPS13 | 198.80 | 371.07 |

TPS13 is selected provisionally for the added verified geographic support. **TPS11 is better on these reduced fourteen diagnostics.** The tradeoff is explicit: TPS13 constrains the two physical areas that TPS11 leaves with large errors, while worsening some remaining checks, especially McLennan. This is not a demonstrated whole-panel improvement over TPS11 and does not establish the working target independently.

For TPS13, the fourteen diagnostics have median **201.17 m**, empirical P95 **307.48 m**, maximum **371.07 m**, and bias **+24.41 m east / -18.67 m north**, with 196.41 m RMS scatter about the mean. The eight recent diagnostics alone give **235.25 m RMS**; the six audited historical island diagnostics give **135.75 m**. These groups differ in observation provenance and are reported separately. Distances use the existing 6,371,008.8 m sphere and mean-latitude cosine convention, warped minus reference; P95 is a linear sample percentile, not a confidence guarantee. Observation uncertainty is not subtracted.

## Actual raster, distortion and browser

`selected-tps13/freeze.json` freezes controls and boundary before new-feature validation. Exact GDAL TPS (`-et 0`), bilinear resampling and 20 projected-metre cells produce a **4,751 × 6,488 EPSG:3857** GeoTIFF. The file is outside Git:

`/Users/dfakkeldy/Downloads/church-south-distributed-refinement-20260915/rendered/inverness-south-tps13-review-20m.tif`

SHA-256: `b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040`.

Independent cutline rasterization found **zero alpha holes in 22,702,159 interior cells**, with one-output-cell boundary tolerance. Finite-difference orientation sampling found zero reversals in 36,615 samples; maximum sampled anisotropy is 1.0956. These checks address rendering and sampled distortion, not continuous-surface proof or geographic acceptance.

The 27 actual raster/reference windows cover thirteen controls and fourteen diagnostics. Interpolated controls coincide by construction; their surrounding shore shapes still differ in places. Island centroids do not imply complete coastline agreement. McLennan remains visibly south of its reference, and West Lake Ainslie remains northwest. The southwestern water extract is included explicitly; a first window-generation pass omitted it from the plotting inputs and was corrected before final review. Source and scoring inputs were unaffected.

The production GeoTIFF decoder preserved alpha and the embedded CRS/transform, with 81 mesh nodes agreeing below 0.001 projected metre. Five editable control/diagnostic inventories also round-trip through the production CSV parser and compare TPS with GDAL at checks and content vertices. This does not test a raw-scan GCP mesh.

The actual browser import reports the correct source dimensions, persists across navigation/reload, and displays only this raster among sixteen My Maps records at 70% opacity. A 2D overview shows the complete cutline. McLennan / River Denys was compared in 2D and at 10× terrain with 50° and 0° tilt; Skye was compared in 2D and at 10×/50°. No console errors were returned. Terrain makes the valley/ridge context clearer, but exaggerated foreground slopes can hide the water, so straight-down and 2D views remain necessary. No control coordinates were measured from perspective screenshots. `browser-review.json` indexes the local screenshots and DOM receipts.

## Remaining work and reproduction

Fresh independent validation is still required across coast, interior, edges and seams. The 20–30 identifiable-check ambition remains unmet for this fit; do not manufacture weak matches. MacPhail Brook, Cranberry Island and possible historical Beaver Dam / modern MacGregors Lake are unscored search candidates, not adopted observations. Keep this fit frozen during collection. Preserve the accepted July baseline and all prior trials.

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-validation-20260915/verify_reports.py
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-distributed-refinement-20260915/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

Verification replayed 24 trial metric sets here and 46 preserved first-validation metric sets in the preceding report. All 428 Church tests passed. These local results do not constitute hosted CI or geographic acceptance.

Source-derived figures retain David Rumsey Map Collection / Stanford Libraries attribution and recorded CC BY-NC-SA 3.0 terms. Modern water/transport geometry retains its original provincial provenance. Mapzen terrain attribution remains visible in the browser.
