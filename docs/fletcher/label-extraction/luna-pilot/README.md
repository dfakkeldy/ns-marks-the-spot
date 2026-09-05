# Fletcher label-extraction model pilot

**Partial result: Luna, Terra and Sol were tested; the requested Claude Opus 5 comparison is waiting for login.** No candidate has been imported into the accepted inventory. The inventory remains at 70 annotations.

The pilot tests a practical workflow: inexpensive first-pass extraction from native crops, followed by source review and a separate placement stage. These results do not support unattended extraction or accepting a model's self-reported confidence.

## Results so far

Six crops contain 27 complete reference annotations. Three provisional readings/groupings are excluded from strict text scoring, leaving **24 clear references**. Edge fragments are recorded separately.

The counts below allow the explicitly documented **manual splitting and regrouping** of model output. They are more generous than raw-record accuracy and are not end-to-end acceptance rates. Superscript-c typography, case and whitespace are normalized; punctuation differences remain separate.

| Requested model, medium effort | Exact text after regrouping | Additional punctuation-only differences | Wrong wording / incomplete | Geometry outcome |
| --- | --- | --- | --- | --- |
| gpt-5.6-luna | 17/24 | 1 | 4 / 2 | Valid bounds, but visual defects remain |
| gpt-5.6-terra | 20/24 | 1 | 3 / 0 | Valid bounds, but visual defects remain |
| gpt-5.6-sol | 21/24 | 1 | 1 / 1 | Valid bounds, but visual defects remain |
| Claude Opus 5 | Not run | — | — | Awaiting login |

Luna, Terra and Sol emitted 31, 31 and 28 candidate records respectively. Different counts reflect split and merged labels as well as omissions; they are not counts of distinct sites. All 90 candidate records have syntactically valid boxes within their crop bounds. Visual inspection nevertheless found clipped text and wrong image regions.

## Findings that change the workflow

- **Confidence is not an acceptance gate.** Luna read the mineral annotation Barytes as Hawkes, Terra as Haynes, and Sol as Harvies, all marked clear. The project reference was re-inspected at enlarged native pixels; it remains Barytes. This is still a project reading, not independent human ground truth.
- **A correct string can have an unusable box.** Luna's C04 post-office record says P.O. correctly, but its box contains fill and map lines. Terra displaced several C02 boxes to the wrong part of the image. Simple numeric bounds checks passed both.
- **Geographic grouping needs review.** The models split river names, merged the separate Mill and Brook lettering, and interpreted parts of River Inhabitants Road as a river or generic road. Sol omitted Road entirely.
- **Escalation helped some readings.** Sol read Stage Stables and Sh. Mill correctly and preserved the Don. abbreviation, but it still made a confident mineral-name error and had box defects.
- **Ambiguous source evidence stays ambiguous.** The abbreviated clergyman name and the separation of Quartz Mill / Falls were excluded from strict scoring. No model response resolves them merely by asserting a clear reading.

## Practical assembly line

1. **Prepare with scripts:** fixed native-resolution crops, overlap, source hashes and a coverage ledger. Keep unreviewed, candidate-extracted, reviewed and accepted states separate.
2. **Give workers isolated packets:** only assigned images, dimensions, transcription rules and output schema. No prior answers or other workers' results. Keep geography and current place-name guesses out of this stage.
3. **Validate mechanically:** JSON shape, unique IDs, numeric bounds and source references. Render every proposed rectangle back against its source so plausible text paired with an empty box becomes visible.
4. **Review the whole crop for omissions**, then review candidate excerpts for spelling, grouping and clipping. Do not review only what the extractor happened to find. For this source, every crop still needs strong-model or human review.
5. **Resolve exceptions and merge deliberately:** preserve raw candidates, corrections and the accepted wording separately; deduplicate overlapping source annotations without merging separate occurrences of a repeated name.
6. **Place only accepted annotations:** associate source symbols and trace connected roads/water before evaluating modern candidates. Gazetteer points remain reference evidence rather than historical site pins.

**Current decision:** keep cheap-model output as candidate evidence only. Scripts can handle packaging, validation and bookkeeping reliably. Hold the choice of the main extraction/review model until Opus 5 has been tested. This pilot does not establish that adding a cheaper first pass reduces total cost once correction is included.

## Reproduce and audit

- [Crop manifest](crops.json): original pixel windows, exact local PNG hashes and equivalent direct IIIF context links. Raw scans and crops remain outside Git.
- [Frozen project reference](reference.json): copied from baseline commit `b8e14ed01e36fc9d91581b5e561085283dc570ad`, which predates the pilot. No reference transcriptions were changed to match worker output. Worker summaries arrived while packaging the reference, before candidate JSON was opened; this timing is recorded explicitly.
- [Worker prompt](worker-prompt.txt): shared extraction instructions. Workers received only their assigned PNGs and the prompt, with no inherited conversation.
- [Run records](runs.json): requested model/settings, packet sizes and raw-output hashes.
- Raw responses: [Luna C01–C02](luna-c01-c02.json), [Luna C03–C04](luna-c03-c04.json), [Luna C05–C06](luna-c05-c06.json), [Terra](terra-c01-c06.json), [Sol](sol-c01-c06.json). These files intentionally preserve incorrect model output.
- [Adjudication](adjudication.json): every reference-to-candidate mapping, manual text reconstruction and observed box defects. [Results](results.json) are computed from those dispositions.

Run `python3 docs/fletcher/label-extraction/luna-pilot/verify.py` to check the archive's raw-response hashes, dimensions, IDs, reference mappings and score arithmetic. Add `--crops /path/to/crops` to check all six PNG hashes. This verifies recorded data, not the correctness of visual readings. The verifier uses assertions; run without Python's optimization flag.

Local verification passed for all 90 candidate records and six image hashes. All 90 emitted label excerpts were visually inspected. The unchanged Fletcher suite ran 251 tests: 249 passed and two optional image-dependency tests skipped. No renderer or geographic placement changed.

The native source comes from the separate **Georeference Fletcher map sheet** task. This text-reading pilot does not modify that task's fixed geographic evaluation windows, observations or acceptance evidence. Do not use these labels to tune its evaluation and still describe it as independent.

## Limits and pending Opus test

The six crops were selected for representative difficulty from already inventoried areas, not randomly sampled or independently transcribed by a human. One run per configuration is insufficient to rank model families generally. Luna used three two-crop workers; Terra and Sol each used one six-crop worker, so packaging is a confounding factor. No current-model pricing or Codex allowance multiplier was used to infer actual cost. Token consumption, billed cost and active correction minutes were not measured.

Claude Code is installed but reported no authenticated account; the separate browser session also required sign-in. Opus 5 was visible in the existing Claude desktop app, but desktop interaction was interrupted while that app was being used. The user was asked to run `claude auth login`; the six-image blind packet is prepared. **Opus has no score and no failed-quality result.** Pin the requested model as `claude-opus-5` and verify the run's reported model before scoring; do not silently fall back to another Claude version. See [Anthropic model IDs](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions) and [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference).

## Attribution

David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries. Source imagery follows [collection terms](https://www.davidrumsey.com/about/copyright-and-permissions) and [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/); see the existing [permission record](../../../../reports/fletcher/INVENTORY.md). Cropping, transcription candidates and evaluation notes are project work. Software licensing does not replace source-image terms.
