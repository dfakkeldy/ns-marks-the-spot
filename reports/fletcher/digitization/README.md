# Fletcher digitization queue

The task covers all 24 sheets, beginning with the full sheets 22, 19, 16 and 14.
[queue.json](queue.json) is the durable per-sheet stage index. The four
`sheet-N-queue.json` files track all 889 finalized corridor annotations by stable
ID and link their immutable source inventories. Update these records as actual
source inspection, placement review and web integration occur. Pending is not a
blocker; unlocated is not evidence that no historical feature existed.

## Reconciliation — September 12, 2026

Current nightly `c32c85e91` contains the finalized corridor inventories and the
20 other sheets' provisional georeferencing evidence. The [reconciliation
receipt](reconciliation-20260912.json) records the full SHA and inspected open
refinement PR heads. Their experimental fits are not adopted. Coordinate work
uses the merged active full-sheet inputs, with per-sheet pins in
`tools/fletcher/project_labels.py`. Whole-sheet refinement remains separate work.

Sheet 14 now has 166 annotations / 204 lettering anchors through its merged
26-control Hay-topology fit. All 35 native crops matched their original pixels;
12 first-box frame excerpts were inspected. The corridor total is 889 source
annotations, 1,162 boxes, 1,156 derived anchors and six neatline holdbacks.
See [lettering geography](../label-geography/README.md) for evidence and limits.

The Judique pilot has eight approximate points and four group outlines. Those
are the only carried-forward feature placements at this checkpoint. Its earlier
39-control coordinates remain intact; a future projection through the current
44-control fit must retain the earlier coordinates and explain each replacement.
The corrected church stays east of Highway 19. Do not replace it with a new TPS
prediction. F19-JUD-094's user corroboration and the Chisholm mill group evidence
remain in the pilot. Modern reference comparisons must include NSTDB Highways
layer 7 as well as Roads 8 and Bridges 5.

## Continue

1. Inspect original Judique pixels around each pending annotation. Record the
   actual symbol, traced feature or defensible group region separately from its
   lettering boxes. Preserve unresolved identity and coverage questions.
2. Transform supported source geometry with the frozen active fit, retaining
   source frames, fit revision/hash, previous geometry and geographic limitations.
3. Integrate reviewed results into the existing Fletcher web-map style with
   selection, source excerpts and distinct reading/placement uncertainty.
4. Complete the other priority sheets, then reconcile and reuse extraction runs
   for the other 20. Source transcription can continue while fits are unsupported.

No new historical features have been integrated into the web map at this
checkpoint. A source PR/merge is not production deployment or geographic proof.
