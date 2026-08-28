# Sheet 19 — offset vs distortion, and the control-density law

Run 2026-07-30. Uses **only** the points already measured in
`tools/fletcher/feature_observations/sheet-19.json`. No imagery was read and no
new controls were placed. Purpose: replace the guessed "45–50 points per sheet"
with a measured point budget before sheets 22, 16 and 14 are started.

Method: refit the TPS warp at increasing control counts (spatially stratified by
farthest-point sampling) and score every fit against the same 8 frozen final
checks; then leave-one-out over all 45 controls for a 45-sample residual field.
The N = 45 row reproduces the committed `sheet-19-score.json` exactly
(RMS 43.0 / P95 90.8 / max 90.8 m), which validates the harness.

## Held-out error vs control count

| N controls | RMS m | P95 m | max m |
| ---: | ---: | ---: | ---: |
| 4 | 313.6 | 511.6 | 511.6 |
| 6 | 403.8 | 797.4 | 797.4 |
| 8 | 364.7 | 628.6 | 628.6 |
| 12 | 366.5 | 646.7 | 646.7 |
| 16 | 313.9 | 642.5 | 642.5 |
| 20 | 318.5 | 652.0 | 652.0 |
| 25 | 189.6 | 455.7 | 455.7 |
| 30 | 133.9 | 259.9 | 259.9 |
| 35 | 117.6 | 259.9 | 259.9 |
| 40 | 98.9 | 259.9 | 259.9 |
| **45** | **43.0** | **90.8** | **90.8** |

**The curve has not flattened at 45.** The last five controls more than halved
the error. There is no evidence of a plateau, so the control count must not be
reduced below 45; the true saturation point is above the data we have.

Below about 25 controls the ordering is noise, not signal — every sparse fit is
bad and which is worst is not meaningful with 8 checks.

## It is distortion, not a frame offset

Decomposing the residuals into a common-direction shift plus a spatially varying
remainder:

| Basis | Total RMS | Uniform shift | Remainder after removing the shift | Shift's share |
| --- | ---: | ---: | ---: | ---: |
| 8 frozen checks | 43.0 m | 14.4 m | 40.5 m | 11% |
| 45 LOO residuals | 309.4 m | 8.7 m | 309.3 m | **0%** |

Essentially none of the error is a uniform shift. No amount of nudging the sheet
into place fixes it — the sheet's internal geometry genuinely varies, which is
consistent with 1880s coastline and roads being traversed while interior
drainage was sketch-surveyed.

## The density law

Leave-one-out error tracks local control spacing (Pearson r = +0.30 over 45
points; the median split is sharper):

| Half of the controls | Median nearest-neighbour spacing | Median LOO error |
| --- | ---: | ---: |
| Densest | 283 px (~760 m) | 119 m |
| Sparsest | 677 px (~1,830 m) | 324 m |

Both halves land near the same ratio:

> **LOO error ≈ 16% of local control spacing.**

Metre conversion assumes the ~2.7 m per source pixel figure recorded for the
Inverness sheet in `tools/church/georeference.py`; treat it as approximate.

## What this means for the point budget

1. **Do not cut the count.** No plateau by 45. 45 is a floor, not a target.
2. **Placement beats count.** Because error scales with *local* spacing, 45
   controls concentrated where accuracy is wanted beat 45 spread evenly.
3. **`sheet-19-score.json`'s 43.0 m is a QA-neighbourhood figure, not a
   sheet-wide one.** The 8 frozen checks sit in 4 acceptance neighbourhoods.
   Sheet-wide, away from controls, the LOO field says hundreds of metres. The
   committed row should not be read as uniform sheet accuracy.
4. **For a corridor target, budget by spacing, not by sheet.** Wanting ~50 m
   along a route implies roughly 310 m control spacing on that route, and
   whatever the back-country gets is whatever it gets.

## Reproducing

The diagnostic scripts are ad-hoc and were not committed — they do not carry the
test coverage the rest of `tools/fletcher/` has. They rebuild from this
observation file alone using `gdaltransform -tps` with `-gcp` flags and no
raster. Raw output is in `sheet19-density-diagnostic.json`.
