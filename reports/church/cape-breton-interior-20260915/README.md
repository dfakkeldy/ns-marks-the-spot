# Cape Breton interior and western support — 15 September 2026

A six-control TPS is the current provisional review fit. Grand Lake adds eastern
interior support, and the verified northern Lake Uist connection adds southwestern
support. The same two diagnostics improve from 570.00 m on the original affine to
422.67 m. The new North Head check is 350.70 m, still above the 250 m working target.
Neither this sparse check set nor the technical verification establishes whole-panel
acceptance. No catalog activation, tiles or deployment occurs.

Native detail corrected the earlier “Shaw Lake” reading to **Grand Lake** before
CB11 was adopted or scored. The official lake identity lies within the original
water polygon, whose northwestern northern-basin apex supplies the physical point.
The source and reference retain the squared northern basin with a recessed north
shore, a middle neck and broader southern basin; small details are generalized.
The Catalone landform under the printed L remains withheld because its connection
and exact tip are not resolved. Original search filenames and rejected readings
remain disclosed in `search-decisions.json`.

CB11 was a prospective control, never fresh validation. Its unfitted errors were
332.41 m on affine3, 573.10 m on affine4 and 689.58 m on TPS4. Adding it improved
same-two TPS diagnostics to 440.45 m but worsened affine5 to 670.31 m. That TPS5
was frozen and rendered before further validation.

CB12 identified the Ken Power Brook junction at the northern Lake Uist neck,
through the labelled lake and its connection to Munroe Lake with Enon Lake beside
it. Its **first fresh TPS5 error was 2,779.79 m**, versus 1,318.26 m on affine3,
outside the control hull. `CB12-first.json` preserves this failure. A separate
western trial promotes CB12 to a control; all subsequent checks exclude it and
its aliases. Its historical fresh CSV stays attached to the original TPS5 fit.

| Fit, on the same CB04 Hay / CB09 Low Point diagnostics | RMS | Maximum |
| --- | ---: | ---: |
| Original affine3 | 570.00 m | 613.73 m |
| Southern affine4 | 558.70 m | 585.85 m |
| Southern TPS4 | 552.36 m | 674.65 m |
| Interior affine5 | 670.31 m | 727.53 m |
| Interior TPS5 | 440.45 m | 563.51 m |
| Western affine6 | 463.50 m | 499.94 m |
| Selected provisional TPS6 | 422.67 m | 503.53 m |

Every comparison retains the same two diagnostic features. Full median, empirical
P95, directional bias and per-feature errors are in the trial JSON files and
`accuracy-summary.json`. Ground distances use the retained mean-latitude cosine
convention, not raw projected metres. Empirical P95 is not a confidence interval.

After TPS6 was frozen, CB13 independently measured North Head's eastern apex,
engraved Coal Point on the west side of Indian Bay. Its first error is **350.70 m**
(−321.47 m east, −140.17 m north), versus 740.19 m on affine3. For this one fresh
check, RMS, median, P95 and maximum all equal 350.70 m. It is outside the hull;
no further tuning follows this result in this report. Do not pool it with the
selection diagnostics or the earlier promoted Lake Uist check.

The exact TPS6 raster is 6,655×5,344, EPSG:3857, with 20 projected-metre cells.
It has zero alpha holes in 23,363,177 tested interior cells, with one-cell edge
tolerance. All 25,496 sampled orientation determinants are negative; maximum
sampled anisotropy is 1.1187. These finite samples do not prove the continuous
surface. The preserved TPS5 artifact has its own receipt and coverage result.
Both use the unchanged repaired content boundary; large raster files stay outside Git.

Nine actual raster/reference windows were inspected. Controls coincide at their
measured points, while surrounding outlines still differ; Hay, Low Point and
North Head visibly retain their measured discrepancies. The windows are bounded
regional evidence, not complete coast/interior/seam validation. The production
web parser round-trips all eight inventories and agrees with GDAL TPS at checks
and content vertices. The embedded GeoTIFF decoder/projection probe passes, and
the actual browser importer restores the raster after navigation. Full 2D and
Lake Uist 2D/10× terrain views were inspected with an empty captured error log.
`browser-review.json` identifies the local screenshot evidence.

Northern support, the Hay/Scatarie interval, distributed fresh interior and coastal
checks, and seams remain unresolved. Continue from the frozen TPS6 rather than
restarting the baseline. Preserve the first failures if subsequent refinement uses
these checks. The full georeferencing goal remains incomplete.

Reproduce the measurement and evidence checks with:

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/cape-breton-interior-20260915/verify_reports.py
```
