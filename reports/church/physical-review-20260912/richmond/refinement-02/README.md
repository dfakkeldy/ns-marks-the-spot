# Richmond refinement 02 — Saint Esprit and fresh checks

Adding the separately identified Blue Lake outlet as control **C03** reduces the
Saint Esprit island diagnostic from **323 m to 57 m**. RMS on the **same six
existing diagnostic checks** falls from **158.27 m to 91.23 m**.

Fresh northern/western checks give a different result: **265.38 m RMS**, worst
**382.04 m**. The preceding six-control TPS scores 256.98 m on these same fresh
checks. The repair improves the targeted diagnostics; it does not establish a
uniform whole-sheet accuracy gain. All prior controls, checks, and rasters are
preserved, and the four-county task remains incomplete.

## Saint Esprit investigation and frozen repair

The original Saint Esprit check is on the correct lake island and was not moved.
Historical and modern basin/outlet shapes differ. These sources alone cannot
separate actual shoreline change from cartographic generalization; no physical
change is asserted as the sole explanation.

Fuller, previously verified NSTDB 10k water lines reveal Blue Lake's outgoing
southwestern connection and a distinct eastern incoming branch. The native
engraving shows the same relationship. C03 is the lake-shore/single-line-stream
junction at **(27935, 15371)** in the original **35,735 × 30,429** scan, paired
with longitude **−60.467980325452324**, latitude **45.64817099434229**. Modern
features `124934` (`WALK20`) and `200503` (`WARV50`) share this endpoint.

`control-observation.json`, its native/reference crosshairs, the broad Blue Lake
context, and `C03-reference-features.geojson` preserve the evidence. The modern
extract receipts and hashes are in `C03-reference-receipts.json`. The 40 m
placement uncertainty is an estimate, not a surveyed error bound. Reported
positions use continuous GDAL pixel/line coordinates; the half-pixel distinction
from drawn pixel-centre crosshairs is under about 2 ground metres here and is
included in the much larger stated measurement uncertainty. Decimal centroid
precision does not imply subpixel geographic accuracy.

The seven-control fit was selected and frozen **before** the fresh check
correspondences were measured. Its exact CSV hash is
`b7dc6719747a32d2fc4c64cc65df45514cac20ab7a9b7bad69768710035da7f6`.
No existing check became a control. `repair-diagnostics.json` retains the TPS and
affine comparison; seven-control affine RMS is 193.37 m, so TPS is retained.

| Existing diagnostic | Six-control TPS | Seven-control TPS |
| --- | ---: | ---: |
| supply-08 | 52 m | 54 m |
| Saint Esprit, supply-15 | 323 m | **57 m** |
| supply-18 | 68 m | 47 m |
| Barque, supply-23 | 123 m | 165 m |
| Corrected Blake Island | 145 m | 90 m |
| D01 northern islet | 53 m | 80 m |
| **RMS** | **158 m** | **91 m** |

The increases at Barque and D01 are retained rather than hidden by the aggregate.

## Fresh validation after the freeze

Four check identities and native outlines were selected after the freeze and
all recorded before scoring. They did not enter fitting or model selection.

| Fresh check | Area | Six-control TPS | Frozen seven-control TPS | Inside source control hull |
| --- | --- | ---: | ---: | --- |
| F01 | Isolated northern island near the engraved 45°50′ rule | 18 m | 41 m | Yes |
| F02 | Northern diamond islet in the western basin | 318 m | 325 m | No |
| F03 | Western quadrilateral islet in the same basin | 366 m | 382 m | No |
| F04 | Island labelled Heron near Escousse | 169 m | 169 m | Yes |
| **RMS** | | **257 m** | **265 m** | |

F02 and F03 are separate islands in one locality, not two widely separated
regional tests. The northern harbour pair was excluded because its relative
shape/order could not be reconciled confidently. A modern island between the
Round group and Boom Island was not clearly identifiable in the engraving and
was also omitted. These exclusions preceded scoring and are retained in
`fresh-checks.json`.

`fresh-scores.json` preserves both fits on the identical fresh set. The two
largest fresh errors lie outside the western control hull; that is evidence for
adding western support in a later revision, not proof of accuracy everywhere
inside the hull. No fresh check was subsequently fitted or moved in this
revision. If a future repair uses these results for diagnosis, preserve this
first-evaluation score and label subsequent replays accordingly.

Coverage is limited to one northern and three western checks spanning two
western localities. There is still no fresh check near Grand Narrows or the far
eastern/southern edges. Four fresh points do not meet the full per-panel
six-check minimum, and the inherited diagnostic pool must not be substituted
for a new, geographically distributed validation set. Geographic acceptance
remains **false**.

## Artifacts and verification

Both new TIFFs are rendered directly from the hash-verified native source with
GDAL TPS, `-et 0`, bilinear resampling, EPSG:3857 and alpha. The previous content
boundary is unchanged; source attribution and provisional status remain embedded.

- `richmond-refined-v2-tps-5m.tif`: 25,877 × 18,042 pixels.
- `richmond-refined-v2-tps-20m.tif`: 6,470 × 4,511 pixels.

Cell sizes are projected metres, not accuracy statements. The orientation test
found zero nonnegative determinants at 25,392 sampled locations; this does not
prove that the continuous TPS is fold-free. The full-raster coverage check found
zero transparent holes in **327,156,332 interior cells**, with one output cell of
edge tolerance. Neither result establishes geographic acceptance.

`warped-review/` contains windows of the actual 20 m GeoTIFF with directly
projected NSTDB major-water geometry. Straight extract seams are not coastlines.
The full 5 m TIFF was separately exercised through the real browser file chooser,
reload and detailed Saint Esprit rendering. `browser-verification.json` records
its exact file and the observed result. `parser-verification.json` verifies all
CSV variants and agreement between the production web TPS solver and GDAL.

Use **Curved warp (TPS)** with the exact native scan and choose the appropriate
review CSV:

- `frozen-fit.csv`: seven controls plus the six existing diagnostics; reproduces
  the 91 m diagnostic RMS.
- `fresh-validation-review.csv`: the same seven controls plus four fresh checks;
  reproduces the 265 m fresh RMS.
- `richmond-refined-v2.csv`: complete seven-control/ten-check inventory. Its mixed
  check pool is not either headline measurement above.

Do not attach native-scan pixel controls to a resampled GeoTIFF. The raw native
scan/browser TPS mesh was not exercised; the delivered TIFF uses embedded
georeferencing. Historical crops/figures retain the source licence and credit
specified in the parent report, separately from code licensing.

Reproduce scores from the repository root with `PYTHONPATH=.` and the GIS Python:

```sh
PYTHONPATH=. python3 reports/church/physical-review-20260912/richmond/refinement-02/fit_and_score.py
PYTHONPATH=. python3 reports/church/physical-review-20260912/richmond/refinement-02/score_fresh.py
PYTHONPATH=. python3 reports/church/physical-review-20260912/richmond/refinement-02/render_refinement.py \
  --source /path/to/exact/richmond.tif --out /path/to/new/output
```

The renderer verifies the source and the fresh-score/frozen-fit relationship.
Large local outputs are in
`/Users/dfakkeldy/Downloads/church-refinement-02/rendered/`; canonical compute
outputs are in `/var/home/dan/nsmarks-church-20260912/refined-tps-v2/` on Bazzite.
No tiles, catalog activation, or deployment are included.

The preceding PR head's web/core CI passed, but a native UI panel-settling
assertion failed outside this georeferencing change. See
`verification-summary.json` and the latest PR checks for the current CI state.

The Church skill reference now recommends separate diagnostic/fresh review CSVs
because the importer distinguishes control/check roles but not validation phases.
The skill links and all report JSON were checked.
