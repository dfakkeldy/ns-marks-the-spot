# Judique south extraction record

Six overlapping native-pixel windows were assigned to three isolated Sol workers (two, one and three crops). Their **29 raw candidate records** became **22 reviewed annotations** after resolving edge fragments and overlap duplicates. Whole-crop review added one omitted elevation annotation, giving **23 additions** to the research inventory. No candidate was imported automatically.

[Reviewed inventory](../judique-south.json) · [Readable review and next coverage](../judique-south-review.md) · [Crop/coverage ledger](crops.json) · [Run records](runs.json) · [Worker instructions](worker-prompt.txt) · [Candidate dispositions](adjudication.json)

Raw worker responses, including errors, remain unchanged: [S01–S02](sol-s01-s02.json), [S03](sol-s03.json), [S04–S06](sol-s04-s06.json). All positions in these files are crop-local. The reviewed inventory uses original whole-sheet pixels.

The coordinator inspected all six whole crops, all 29 candidate excerpts and all 23 final lettering excerpts. Every final rectangle was manually reviewed; several were expanded or tightened. In particular, J. McPherson's candidate rectangle clipped its final letters, the Farm Road rectangle clipped the initial F, and the Shop rectangle included a nearby building mark. Overlap fragments of Chisholm Brook, General Line Road and Long Point were joined by source position. The separate coastal and inland Long Point inscriptions remain separate.

The extra `J.` in the worker's `J. A. McDougall` was rejected as a road stroke; the source reads **A. MᶜDougall**. Whole-window review also found **700 Fᵀ.**, absent from worker output. These findings support retaining source review and explicit correction records. This batch is production of research data, not a new blind accuracy benchmark or evidence of measured cost savings. Actual token usage, billed cost and active correction minutes were unavailable.

Three additional source windows finish intersecting edge names: D. MᶜPherson, General Line Road and Wood Road. They are not fully inventoried areas. Widely spaced large C / R / A lettering in the eastern crop remains deferred until its complete wording can be read.

Run `python3 docs/fletcher/label-extraction/judique-south-workflow/verify.py`. Add `--crops /path/to/crops` to check the six source PNGs and three completion PNGs against their recorded hashes. The checks cover raw integrity, coverage, references, annotation IDs, bounds, overlap bookkeeping and null historical-site geometry. They do not prove correct reading, completeness or geographic accuracy.

The [native source receipt](../sheet-19-native-source-2026-09-05.json) came from the separate **Georeference Fletcher map sheet** task. This work does not change its fixed evaluation windows or geographic acceptance evidence. Raw source imagery and review images remain outside Git. Attribution: David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries; [collection terms](https://www.davidrumsey.com/about/copyright-and-permissions), [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/), and the [existing permission record](../../../../reports/fletcher/INVENTORY.md).
