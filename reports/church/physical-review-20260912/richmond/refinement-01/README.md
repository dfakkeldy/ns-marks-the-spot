# Richmond physical refinement 01

The six-control TPS reduces RMS on the **same four diagnostic checks from
342.59 m to 177.88 m**. The Barque check improves from 616.50 m to 122.89 m.
Across the expanded six-check diagnostic set, RMS is **158.27 m** and maximum
error is **322.69 m**, at Saint Esprit Lake. The earlier affine artifact and
all its observations remain unchanged.

## Correspondences and model comparison

Two new physical controls were measured from native outlines:

- **C01, Round Island:** the large western triangular island in the northern
  group, north of Boom Island. Shore geometry and neighbouring islands confirm
  its identity. Estimated placement uncertainty is 40 ground metres.
- **C02, islet north of the Barque group:** the main isolated islet between the
  mainland and the three Barque islands. Its small historical outline is
  exaggerated and damaged. Short missing strokes were closed explicitly to
  measure a provisional centroid; its larger 90 m uncertainty is retained.

**D01**, the small island east of the Round Island group, is a new excluded
check. It tests that locality near C01, not the whole northern extension. The
larger eastern island was omitted because the historical drawing splits it into
two pieces while the modern ring is connected. No ambiguous centroid was adopted.

`new-observations.json` records exact source pixels, native crop origins and
sizes, traced outlines, modern feature/polygon/ring identifiers, roles,
uncertainty, and visual evidence. `search-frames.json` and the broad source and
reference figures establish neighbourhood context. The reference figures use the
old affine only as a search guide. The three final native crosshair figures were
reviewed before any new residual was computed.

All four original controls and all five existing diagnostic coordinates,
including corrected Blake Island, are unchanged. No check became a control.
The delivered `richmond-refined.csv` contains six controls and six checks in the
original **35,735 × 30,429** scan frame. Select **Curved warp (TPS)** when using
that CSV with the exact native scan. Do not attach it to a resampled GeoTIFF.

| Model | Same original four checks: RMS / max | All six diagnostics: RMS / max |
| --- | ---: | ---: |
| Original four-control affine | 343 / 617 m | 384 / 636 m |
| Original four-control TPS | 338 / 605 m | 379 / 629 m |
| Refined six-control affine | 238 / 398 m | 208 / 398 m |
| **Refined six-control TPS** | **178 / 323 m** | **158 / 323 m** |

`trial-01.json` preserves all comparisons, including the identical five-check
set with Blake. TPS provides a material improvement over the refined affine;
its model choice and these scores use diagnostic data. Saint Esprit worsens from
270 m under the original affine to 323 m under the selected TPS, and is retained
rather than hidden by the aggregate improvement.

`C02-sensitivity.json` applies the already recorded 90 m uncertainty in four
cardinal directions as a diagnostic only. The original four-check RMS stays
between 177 and 192 m. No perturbed position is selected or written into the fit;
these samples are not a confidence interval or a bound on every possible error.

## Rendering and verification

The exact archival TIFF hash was verified again before rendering. The source
content boundary is unchanged from the expanded first draft; it is densified
before transformation. Both artifacts are rendered directly from the native
source with GDAL TPS, `-et 0`, EPSG:3857, bilinear resampling and alpha:

- Full raster: `richmond-refined-tps-5m.tif`, 25,949 × 18,159 pixels.
- Review raster: `richmond-refined-tps-20m.tif`, 6,488 × 4,540 pixels.

Cell sizes are projected metres and do not state geographic accuracy.
Attribution, source URL and provisional status are embedded. Historical crops
and figures retain the source licence and credit documented in the parent report.

The orientation diagnostic found zero nonnegative determinants at 23,711
samples, with 200-native-pixel spacing across the content and 25-pixel spacing
near controls. That is a finite test, not proof that the continuous TPS cannot
fold. The full-raster coverage verifier found **zero transparent holes in
334,132,792 interior cells**, with one output cell of boundary tolerance.

`warped-review/` shows windows of the actual 20 m GeoTIFF with directly projected
NSTDB water. The Barque area and northern shore improve visibly. Coast and island
shapes still differ; straight extract seams are labelled and are not scored as
shorelines. The full 5 m GeoTIFF was separately imported through the real web
file chooser, retained its dimensions/enabled state after reload, and rendered
at zooms 10–12 without captured browser console errors. The real CSV parser and
web TPS solver also passed round-trip and GDAL consistency checks.

## Remaining limits

These are **six diagnostic checks and zero fresh validation checks**. They remain
excluded from fitting, but were selected or reused during diagnosis. C02 was sought
near the failed Barque region and D01 lies near C01; this is evidence of local
repair, not a claim of broad independent validation. The six-point numerical gate
is met, but county-wide geographic acceptance remains false. Fresh distributed
validation, Saint Esprit investigation, and unsupported northern/edge review
remain open. Other counties, catalog URLs, tiles and deployment are unchanged.

## Reproduction

From the repository root, with the prior report and GDAL available:

```sh
PYTHONPATH=. python3 reports/church/physical-review-20260912/richmond/refinement-01/score_refinement.py
PYTHONPATH=. python3 reports/church/physical-review-20260912/richmond/refinement-01/render_refinement.py \
  --source /path/to/exact/richmond.tif --out /path/to/new/output
```

`measure_points.py` reproduces the reviewed outline centroids from the recorded
native crops; `verify_import.ts` exercises the production parser and TPS solver.
`artifact-receipt.json`, `coverage.json`, `parser-verification.json`, and
`browser-verification.json` distinguish the evidence. Large outputs are retained
under `/var/home/dan/nsmarks-church-20260912/refined-tps/` on Bazzite and
`/Users/dfakkeldy/Downloads/church-refinement-01/` locally.
