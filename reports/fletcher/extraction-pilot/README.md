# Judique extraction-first pilot: partial feature recovery, no new georeference

The 12-area pilot is complete. It recovered useful shoreline and main-river
shapes, but did not pass the extraction prerequisite for dependable inland
matching. Faint tributaries disappear, while coordinate rules, railway and
connected text sometimes survive. No production controls, warps, tiles or map
configuration changed. No saved hand correction was replaced.

A subsequent [visual stream-matching test](../visual-match-test/README.md) found
a coherent four-junction pattern, but failed the saved-reference agreement gate
and exposed a suspect earlier control in that reference. It did not use these
extraction masks or establish an accepted new georeference.

## Important correction to the earlier experiment

The whole-image IIIF JPEG used by the first matching benchmark has the declared
10815 x 7549 dimensions but visibly blurred, enlarged detail. Independent native
640-pixel regional downloads show fine streams, road outlines and print texture
that the old image lacks. The native mosaic was rebuilt from 40 serialized,
cached 1536-pixel regions using the existing `tools.fletcher.fetch` downloader.
There is no evidence here that published tiles or the earlier regional-download
pipeline share this defect: it was the benchmark's ad-hoc full-image acquisition.

All 12 paired probes flag detail loss in the old image. Native/old Laplacian
variance ratios range from 100.6 to 169.3 (median 130.8); native-probe/mosaic ratios
range from 0.998 to 1.014. These are same-location sharpness diagnostics, not
resolution multipliers, positional accuracy or archival-quality certification.
The downloadable visual report shows the direct comparison. Whole-image
nominal dimensions alone must not be used to certify source detail.

`tools.fletcher.source_detail` now provides a reproducible paired-probe check
and explicitly returns `inconclusive` for blank probes. Reproduction should use
the regional mosaic and verify against separate native probes before matching.
Old images and frozen results are retained rather than rewritten.

## Twelve crops and observed outcome

Rectangles were selected from the overview before extraction, with one crop per
stratum (C1/I1/H1) for development and nine others for evaluation. Strata describe
image appearance, not an independently classified mountain/lowland dataset.
All source crops were visually inspected to annotate examples. No modern
coordinates or corrected-map pixels entered extraction.

| Crop | Use | Visual result with frozen extractor |
| --- | --- | --- |
| C1 | Development, coast | Main shore and island edges; small place-label remnants survive. |
| C2 | Evaluation, coast | Shoreline follows land/sea boundary; a bottom label remnant remains. |
| C3 | Evaluation, coast | Oblique shoreline recovered; not enough distinctive geometry alone to fix a control. |
| C4 | Evaluation, coast | Main shoreline recovered beside dense crosshatching. |
| I1 | Development, Graham River | Main stem recovered; faint tributary branches mostly missing. |
| I2 | Evaluation, faint inland stream | Intended west stream missed; stronger northeast linework survives instead. |
| I3 | Evaluation, faint inland fork | No extracted line candidates; visible stream entirely missed. |
| I4 | Evaluation, Rough Brook | Main stem largely recovered; fine branches incomplete. |
| H1 | Development, dense hatching | Strong winding lines recovered, with some attached road/annotation fragments. |
| H2 | Evaluation, dense hatching | Straight coordinate-grid cross dominates; fine target watercourse missed in part. |
| H3 | Evaluation, water-negative example | Mostly empty; surviving upper boundary/line is not validated as water. |
| H4 | Evaluation, railway and water | Water mixed with railway, roads and connected lettering; unsuitable as a water mask. |

These are feature-extraction observations, not accepted geographical matches.
Coastal edges remain useful candidates for a later shape-matching experiment,
but we did not infer inland success from the coastal examples.

## Method and limitations

The baseline uses RGB local contrast, an adaptive red-channel darkness limit,
red-ink rejection and long connected components. Coast crops instead use the
largest bright paper region with small-hole cleanup to estimate land/sea edges.
Coastal crop identification is supplied by the experiment; the algorithm does
not discover coast versus inland automatically. Hole cleanup can suppress small
islands, and the coast output need not coincide with the precise historical
waterline or sandbar edge. It must not be treated as a surveyed coastline.

The development sequence was local contrast alone (too much geology), an
absolute darkness cap (lost the clear river), then background-relative darkness.
The shoreline method was developed separately on C1. The final method and source
annotations were frozen at `c517f5af` before evaluation. No learned model was
trained and no published semantic-segmentation method was reproduced: the
resulting inland masks are explicitly **line candidates, not semantic water**.

`annotations.json` records source-only sparse hand-placed trace samples and
confuser/road probes. `extraction-receipt.json` includes their support within
3 source pixels, but these are approximate annotations, not dense or independently
reviewed labels. Visual audit found some probes displaced from the intended
stroke; do not interpret their support percentages as segmentation precision or
recall. They remain unchanged for transparency. The main stop decision rests on
visible failures (I2/I3 missing waterways; H2 grid; H4 railway/text), not on a
fragile numeric threshold. No claim of calibrated neural confidence is made.

The extraction gate therefore stops this run before learned correspondence,
modern-vector matching or a new warp. Adding LightGlue to these masks would not
supply the missing water identity. The next substantive experiment would require
verified semantic labels and a context-aware extractor, rather than another
round of threshold changes on these evaluated crops.

## Native-source controlled rerun of the earlier matcher

As a separate diagnostic declared in NATIVE-DIAGNOSTIC.md, the unchanged earlier
matcher was rerun on the native mosaic with both original search radii. Both
prediction receipts were committed at `b3814ab7` before scoring.

| Sheet 19 source / search | Accepted | Accepted target | Baseline → proposed error |
| --- | ---: | --- | --- |
| Old whole-image JPEG, ±80 | 0/64 | — | — |
| Native mosaic, ±80 | 1/64 | c03 | 81.8 → 88.8 m |
| Old whole-image JPEG, ±320 | 0/64 | — | — |
| Native mosaic, ±320 | 1/64 | c03 | 81.8 → 88.8 m |

Native source detail changes the result, but the sole accepted proposal worsens
its seed-only position and coverage remains 1.6%. Both variants fail the earlier
trial gate. The source problem limits the original broad diagnosis; repairing it
does not rescue this raw-ink matcher. Errors use the earlier seed-affine
metre-equivalent scoring convention, not a new surveyed ground-accuracy test.
Sheet 16 was not rerun and its native-source performance remains unknown.

## Reproduction and evidence

Raw inputs, images, intermediate variants and review PDF remain in
`/Users/dfakkeldy/Downloads/fletcher-extraction-pilot`. Git retains source
rectangles, request URLs, hashes, annotations, method, source-quality receipts,
predictions and scores. `native-mosaic-receipt.json` records every source part
and the lossless mosaic hash. Repeated extraction reproduced the nine evaluation
masks byte-for-byte after a reporting-only component-count correction.

```sh
python -m tools.fletcher.source_detail \
  native-sheet19/sheet19.png reports/fletcher/extraction-pilot/crops.json \
  CROP_DIRECTORY detail-receipt.json
python -m tools.fletcher.extraction_pilot \
  reports/fletcher/extraction-pilot/crops.json CROP_DIRECTORY NEW_OUTPUT_DIRECTORY \
  --split all --annotations reports/fletcher/extraction-pilot/annotations.json
```

Source crops use `native-C1.jpg`, etc.; URLs and checksums are in
`native-receipts.json`. NumPy/OpenCV are optional local experiment dependencies.
No new production runtime dependency is introduced. New tests check rejection of
coloured/red ink, preservation of synthetic strokes through hatching, empty
annotation denominators, enlarged-thumbnail detection, native consistency and
inconclusive blank probes. All relevant tests were run with image dependencies
present; environments without them skip those tests explicitly.

Agent effort included source inspection, tracing, extraction development and
visual review. It is not a timed human georeferencing baseline. **No reduction
in user review time has been demonstrated**, so the practical success criterion
is also unmet. The review artifact presents selected shapes and failure reasons
rather than asking the user to verify another imported set of controls.

Imagery: David Rumsey Map Collection, David Rumsey Map Center, Stanford University
Libraries, Fletcher Sheet 19 (1884), item RUMSEY~8~1~2644~290012. Source imagery
remains subject to its CC BY-NC-SA terms and separately recorded project
permission. Raw/annotated imagery is kept out of the software repository.
