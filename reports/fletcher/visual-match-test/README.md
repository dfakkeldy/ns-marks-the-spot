# Judique visual correspondence test

A visual inspection found a coherent group of four stream junctions in dense
hatching, but the candidate **did not pass the predeclared reference-agreement
gate**. It is a proposal for review, not an accepted control or a validated new
georeference. No production controls, tiles, warps or user corrections changed.

The test also found a suspect earlier control in the comparison data. Therefore
failure against that interpolated reference does not, by itself, establish
which location is correct. This run supports neither unattended matching nor a
claim that the visual approach is impossible.

## Subsequent user review

The user subsequently accepted the four proposed junctions visually and asked
to continue. The [Judique draft report](../visual-expansion/README.md) records
that expansion, including preserved hand controls, additional checks, an initial
failure and a corrected draft. The results below remain the original test record.

## Proposed correspondence

The target T is the northern tributary joining the east-west stream immediately
north of the old road near the Rory Chisholm / River Denys Road area of Sheet 19:

- Historical source pixel: **(5338, 3069)** in the native 10815 × 7549 mosaic.
- Proposed modern location: **45.8618824, -61.4186559**.
- NSTDB water-line OBJECTIDs: **196005, 196055, 196056**.
- C1 is its immediate upstream fork. C2 and C3 are two further junctions to the
  west, on the stream following the northern road.

The agent identified these from the native scan and modern water/road vectors,
using the engraved graticule only to delimit the search area. It inspected
branches and road relationships, then audited crosshairs at 3× enlargement.
It did not use the earlier extraction masks or a learned correspondence model.
Eastern tributaries were too ambiguous for additional controls and were omitted.
This was an offline image/vector test; no NSMtS browser edit was performed.

[Open the proposed location in NSMtS](https://kinnokilabs.com/apps/nsmarksthespot/map/?basemap=day&taxSale=off&mode=current&layers=modern&position=45.8618824%2C-61.4186559%2C16).

`predictions.json` was committed at **5910d3cb** before the saved correction
files were reopened. The same agent had prior exposure to the sheet and some
controls in earlier experiments: this is not a pristine blind trial. C1–C3
informed target selection. They were excluded from the one-point translation,
but are not independent operator annotations or untouched selection holdouts.

## Results

For the local consistency check, the printed-grid placement was translated in
Web Mercator using **T alone**, with scale and orientation unchanged. For the
reference comparison, GDAL fitted a thin-plate spline in EPSG:3857 to the 60
`control` rows of `tools/fletcher/measured/sheet-19.csv`. Its eight `check` rows
were excluded. This diagnostic reconstructs a fit from those rows; it does not
verify the transform or provenance of a currently published raster.

| Point | Distance from saved-control TPS | Residual after T-only translation |
| --- | ---: | ---: |
| T | 311.9 m | 0 m by construction |
| C1 | 287.8 m | 51.0 m |
| C2 | 174.3 m | 97.6 m |
| C3 | 95.1 m | 47.8 m |

The frozen gate required T within 100 m of the reference, every context point
within 150 m of it, and every context translation residual within 150 m.
Only the translation-consistency gate passed. T's original printed-grid
location was 217.8 m from the saved-control reference; the proposal is 311.9 m
from it. Thus this test does **not** demonstrate improvement against that
reference. Nor do the 48–98 m consistency residuals establish geographic accuracy.

## Reference problem discovered after scoring

The CSV describes **45 earlier feature-led controls plus 15 hand-added controls**.
It must not be described as 60 independently hand-verified points. The closest
control to T is `cand-0141`, about 544 source pixels away (roughly 1.9 km at the
printed scale); there is no saved control at the proposed junction.

`cand-0141` is an earlier feature-led row, not a `gcp-*` hand-added row. Its
observation claims a road junction at Rory Chisholm. At its saved pixel
**(4913.5, 2729.2)**, the native image shows hatching beside the road/stream,
without the claimed junction. This is a concrete reason to review that row's
source placement. We did not move or delete it, guess a replacement, or infer
that every older control is wrong.

A post-scoring sensitivity diagnostic excluding just that row moved the
reference farther from T: **311.9 → 591.2 m** disagreement. This demonstrates
reference sensitivity, not a successful repair or evidence that our proposal
is true. The primary failure remains unchanged. An image-to-image SIFT/RANSAC
sanity check found an approximately (-2.6, -3.8) pixel old-to-native translation,
318 consensus matches, and 4.7 pixel 95th-percentile residual: a gross source
coordinate-frame mismatch does not explain the 312 m discrepancy.

The next useful step is an independent verification of T and review of the
suspect existing row, with their evidence side by side. Fitting a new warp to
these four correlated proposals or expanding to the whole sheet would get
beyond what this test supports.

## Effort and verification

Candidate preparation ran from 19:12:27 to 19:22:36 UTC on 5 September 2026,
about **10 minutes 10 seconds**, including source inspection and figure setup.
Subsequent reference investigation, scoring and reporting took additional time.
There is no timed human placement/review baseline, so no time saving is claimed.
The remaining human burden has been narrowed to a specific proposed junction
and a specific suspect old control, rather than a batch of unexplained points.

Run the deterministic score replay with NumPy and `gdaltransform` installed:

```sh
python reports/fletcher/visual-match-test/replay.py
```

It checks hashes, excludes reference check rows, recomputes all four primary
scores and the one-row reference sensitivity, and retains the failed gate.
Replay agrees within 1 mm of the recorded numerical calculations; this is
reproducibility tolerance, not map accuracy. The visual identification itself
is manual agent work and is not reproduced by that script.

Local visual artifacts are in `/Users/dfakkeldy/Downloads/judique-visual-match`:

- `judique-visual-test.png`: labelled historical/modern comparison, with the
  modern panel aligned using T alone and the reference's position shown in red.
- `point-audit.png`: enlarged source crosshairs for all four proposed points.
- `reference-control-audit.png`: saved `cand-0141` pixel on the native scan.
- `source-frame-comparison.png`: same-coordinate old/native crops.
- `source-frame-matches.npz`, `source-frame-affine.json`: image-frame diagnostic.
- `render_review.py`, `render_context.py`: local visual rendering scripts.

`predictions.json`, `scores.json` and `reference-diagnostic.json` preserve the
proposal, thresholds, results and post-scoring diagnostic separately. Source
hashes are in the prediction receipt; no raw map imagery is committed here.

Historical imagery: [David Rumsey Map Collection / Stanford, Sheet 19](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/info.json),
CC BY-NC-SA 3.0 and the project's separately recorded permissions. Use the
verified native regional mosaic described in the [extraction pilot](../extraction-pilot/README.md).
Modern data: Nova Scotia Topographic Database, using the exact cached extracts
and [source receipts](../matching-benchmark/reference-receipts.json) from the
preceding benchmark. The suspect row's identity and historical provenance are
in `tools/fletcher/feature_observations/sheet-19.json`.
