# Corrected-sheet matching experiment — frozen before scoring

This is an exploratory test of a classical computer-vision matcher, not a
production georeference or a claim about all AI methods. Run Sheet 19 (Judique)
first, then Sheet 16 with the same settings. Neither corrected sheet is changed.

## Question

Given four trusted correspondences and the modern position of another known
feature, can local line matching recover its historical pixel location more
accurately than the initial four-point affine prediction, while rejecting
ambiguous matches? This does **not** test automatic discovery of modern features.

`tools/fletcher/measured/sheet-19.csv` and `sheet-16.csv` are the reference
corrections. Four existing control rows are selected deterministically for
spatial spread, using only modern coordinates. Existing `check` rows are never
seeds. The other historical pixel coordinates go to a separate scoring file;
matcher inputs include only seeds and modern target coordinates. The first two
rows of each CSV were inspected during sheet identification before this
protocol; this is a programmatically separated evaluation, not a claim that the
operator has never seen any reference data. No withholding claim is made about
modern coordinates, which deliberately form the target list.

The Judique test has 4 seeds and 64 withheld targets (56 formerly used controls,
8 previously frozen checks). Sheet 16 has 4 seeds and 34 withheld targets. These
are comparisons with the maintainer's saved corrections, not surveyed truth.
The Judique inland subwindow is longitude [-61.46, -61.34], latitude
[45.84, 45.91], fixed before scoring. Whole-sheet results are also reported.

## Matcher and fixed gate

Fit an affine in Web Mercator from the four seed pairs. Render modern NSTDB
road, rail, wet-line, and wet-polygon boundary geometry into predicted scan pixel
space. Search a translation of ±80 full-resolution source pixels around each
target using a template of radius 160 pixels. Both images are sampled at half
resolution. Dark scan ink is grayscale <105; proximity to ink is
`exp(-distance / 3)` in working pixels. Rank translations by mean ink proximity
under the rendered template. This simple method does not understand geological
hatching, labels, changed roads, or ambiguous feature identities.

Reject templates with fewer than 80 working ink pixels, near-linear spatial
support (covariance eigenvalue ratio <0.03), or any required crop outside the
scan. Reject peaks on the search boundary, a mean score <0.65, or a gap <0.035
from the best alternative more than 8 working pixels away. These are heuristic
rejection rules, not calibrated probabilities.

A promising sample must have at least 30% proposal coverage, at least 95% of
accepted proposals within 100 ground metres of the saved reference, and at
least 20% median error reduction against the seed-only baseline **on the same
accepted targets**. Zero accepted proposals means no usable automation, not
perfect precision. Keep rejected proposals in the scored receipt too.

Generate and freeze proposals before reading scores. Do not tune thresholds,
replace seeds, or select a different template after viewing gold errors. The
second sheet uses identical settings. Do not feed proposals into the public
map or fit a TPS from them in this experiment.

## Reproduction

Python plus NumPy and OpenCV are needed only for `propose`. Reference splits and
scoring are standard-library Python. Image tests skip explicitly if the optional
image dependencies are absent. All image tests were also run with them present.

```sh
python3 -m tools.fletcher.match_benchmark prepare \
  tools/fletcher/measured/sheet-19.csv inputs.json gold.json
python3 -m tools.fletcher.match_benchmark propose \
  inputs.json sheet19.jpg proposals.json \
  roads.geojson rail.geojson water-lines.geojson water-polygons.geojson
python3 -m tools.fletcher.match_benchmark score \
  inputs.json gold.json proposals.json score.json
```

Output paths must not already exist. `propose` has no gold-file argument.
Scoring validates the input hash and complete target identity set. Receipts
record image dimensions and SHA-256 hashes for the scan and each extract.
Raw imagery and provincial extracts stay outside Git; reports retain source
attribution and are not deliverable map layers. Rumsey source imagery remains
subject to its separately documented permission and CC BY-NC-SA terms.
