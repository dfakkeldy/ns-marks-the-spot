# Judique extraction-first pilot

Selected 12 nonoverlapping 640 x 640 source rectangles from the scan overview,
before viewing extraction outputs: four coastal (C), four clearer inland (I),
four hatched inland (H). Strata describe visible imagery, not surveyed terrain.
The `1` rectangle in each group is development; the other nine are evaluation.
All source crops were inspected to annotate features; this is not a claim of
operator blindness. No corrected modern coordinates enter extraction.

## Source-quality finding

The previous whole-image IIIF download has nominal 10815 x 7549 dimensions but
visibly enlarged/blurred detail compared with native regional requests of the
same rectangles. Preserve both, including old benchmark outputs. Use the native
regional requests recorded in native-receipts.json for this pilot. Do not infer
native detail from dimensions alone. Existing regional downloader is available;
the prior benchmark's ad-hoc whole-image acquisition bypassed it.

## Experiment

First obtain source-only hand-traced examples of waterways, roads, and confusers.
Evaluate feature extraction before any geographical matching. Start with
colour-aware local ink contrast and connected structure filtering, distinguishing
this from learned semantic recognition. If credible masks remain unavailable in
inland rectangles, stop before running learned correspondence/warping and report
this stage failure. Any extraction settings chosen using C1/I1/H1 must be frozen
before evaluating the other rectangles. Record missing or ambiguous reference
features rather than inventing labels.

Measure traced-feature recall within 3 source pixels and contamination around
labelled confuser strokes; sparse annotations do not establish whole-mask
precision. Check branch continuity and visual false positives on all 12 crops.
Any further matching requires distinguishable structures and inland support,
not just lots of detected black pixels. Matching gates remain the research
report's proposed 30% coverage,95% within100m,20% median improvement, plus inspect
any accepted error>250m. These are development gates,not certified accuracy.

No production controls, corrected sheets, tiles or map configuration are changed.
Raw source crops stay outside Git. Record agent tracing/review effort honestly;
it is not a timed human manual-georeferencing baseline.
