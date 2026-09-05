# Judique-first corrected-sheet matching results

> **Source-quality correction (2026-09-05):** this experiment used a nominally
> full-sized JPEG with visibly degraded detail. A [native-region follow-up](../extraction-pilot/README.md)
> corrects acquisition and reruns Judique unchanged: one accepted point out of
> 64, with error worsening from 81.8 to 88.8 m. The frozen results below remain
> valid for their recorded inputs, but must not be described as native-resolution
> matching results. Sheet 16 has not been rerun on a native source.

**This matcher is not suitable for unattended georeferencing.** Judique yielded
no accepted proposals. The second corrected sheet yielded three useful local
matches, but widening the search later introduced an accepted error of 1.04 km.
Neither sheet meets the predeclared trial gate. No production controls, warps,
tiles, or map configuration were changed.

## What was tested

Sheet 19 is Judique; Sheet 16 is the other saved corrected sheet. Four spatially
spread controls per sheet establish a coarse affine placement. All other
historical pixel coordinates are withheld from the matcher. Modern target
coordinates remain available: this tests locating known modern features on the
scan, not finding control points from scratch. Modern roads, rail, water lines,
and water polygon boundaries supply the templates.

This is a classical line-to-ink computer-vision experiment, not a learned visual
AI model. It does not identify rivers separately from geological hatching or
text, or distinguish changed roads from persistent ones. The saved corrections
are the comparison reference, not surveyed truth. Read the [frozen protocol](PROTOCOL.md)
for the thresholds and the disclosure about initial inspection of reference rows.

## Primary results: search ±80 source pixels

| Sheet | Withheld targets | Accepted | Accepted within 100 m | Median error on accepted targets, before → after |
| --- | ---: | ---: | ---: | ---: |
| 19 — Judique | 64 | 0 (0%) | Not applicable | Not applicable |
| 16 | 34 | 3 (8.8%) | 3/3 | 139.8 → 35.3 m |

The trial requires at least 30% coverage, 95% of accepted proposals within
100 m, and 20% median improvement on the same accepted targets. Three successes
are too few to establish dependable precision, and coverage fails on both sheets.
Sheet 16's accepted errors were 33.8, 51.3, and 35.3 m.

Judique's four-seed baseline had a 319.9 m median error across all 64 targets.
Inspection after scoring showed 35 reference locations outside the ±80-pixel
search window. The primary result alone therefore cannot distinguish poor
matching from insufficient search range. Of the 64 proposals, 47 were rejected
as weak or ambiguous and 17 hit the search boundary.

In the predeclared Judique inland window (7 targets), none were accepted. The
baseline median was 278.9 m; unaccepted proposals had a 223.2 m median. Judique's
8 previously designated check points likewise produced no accepted proposals.
These results do not validate a correction for mountainous terrain.

## Follow-up diagnostic: search ±320 source pixels

This variant was declared **after seeing primary scores**, with only search
radius changed. It is a sensitivity check, not fresh blind validation. See the
[diagnostic declaration](WIDE-DIAGNOSTIC.md).

| Sheet | Accepted | Accepted within 100 m | Largest accepted error |
| --- | ---: | ---: | ---: |
| 19 — Judique | 0/64 | Not applicable | Not applicable |
| 16 | 2/34 | 1/2 | 1,038.9 m |

Sheet 16 target `gcp-6` passed the heuristic match gate despite moving from a
105.1 m baseline error to 1,038.9 m. A larger search area gives repeated and
unrelated ink more opportunities to match the template. The score and peak-gap
rules did not reliably reject that false correspondence.

## Interpretation

The experiment supplies no usable automatic Judique correction. It does not
show that AI georeferencing is impossible: sparse seed placement, undifferentiated
ink, and local translation templates limit the method tested. Useful next work
would need feature identity and spatial consistency checks, then a new withheld
validation set. Repeatedly tuning against these same corrections would no
longer be independent validation. Lowering the acceptance threshold or simply
widening the search is not justified by these results.

Reported metres are approximate ground-equivalent pixel discrepancies: the
seed affine maps pixel differences into Web Mercator, with latitude scale
correction. They are not independent geodetic accuracy measurements. The current
fully corrected map is not the four-seed baseline, and its accuracy must not be
inferred from these baseline errors.

## Evidence and reproduction

The adjacent JSON files preserve matcher inputs, proposals, per-target scores,
and reference-source receipts. The repository CSVs can regenerate the withheld
scoring files using the protocol's `prepare` command. All four score receipts
were replayed exactly. Inputs and predictions were committed before each
corresponding scoring step:

- `06e8d3f6`: primary method and protocol.
- `3700d289`: Judique predictions.
- `3ed5de89`: Sheet 16 predictions with unchanged settings.
- `cece84ee`: wider-search diagnostic declaration and inputs.
- `625ddbbb`: diagnostic predictions.

The primary and diagnostic receipts remain separate; no best-looking variant
was selected for publication. Raw scans and provincial extracts remain outside
Git. Local experiment assets are in
`/Users/dfakkeldy/Downloads/fletcher-matching-benchmark`.

Source imagery: David Rumsey Map Collection, David Rumsey Map Center, Stanford
University Libraries. Source imagery is subject to CC BY-NC-SA 3.0 and the
project's separately documented permissions. Full-resolution IIIF sources:

- [Sheet 19, 10815 × 7549](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/full/10815,7549/0/default.jpg)
- [Sheet 16, 10822 × 7531](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2641~290009/full/10822,7531/0/default.jpg)

Modern reference: Nova Scotia Topographic Database ArcGIS services, with WGS84
bounding box `-61.62,45.74,-61.20,46.12`. The [source receipt](reference-receipts.json)
records layer URLs, counts, and exact extract hashes; proposal receipts also
record image and extract hashes. Water queries required bounding-box pagination
without explicit ordering; their collected IDs were checked against the service's
ID list. Extract counts: roads 4,706; rail 37; water lines 3,790; water polygons
1,036. Live services can change, so reproducing exact hashes requires the saved
extracts.

## Downloader repair and verification

Reference fetching exposed a separate defect: an ArcGIS error page could be
treated as an empty successful page and return an incomplete extract. The fetcher
now rejects service errors, malformed feature lists, and empty pages still
marked truncated. Regression tests cover errors after a full page and preserve
valid empty-result behavior. This detects bad responses; it does not repair
upstream service failures.

All 251 Fletcher tests passed locally with NumPy/OpenCV installed, including
synthetic image displacement and ambiguity tests. Without those optional image
dependencies, the two numerical image tests explicitly skip. The experiment
changes no rendered application behavior.
