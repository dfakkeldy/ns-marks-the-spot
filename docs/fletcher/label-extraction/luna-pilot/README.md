# Fletcher label-extraction model pilot

**Completed pilot: Luna, Terra, Sol and DeepSeek V4 Flash Vision Experimental were tested. The optional Claude comparison was set aside at the user’s request.** No candidate has been imported into the accepted inventory. The reference inventory contained 70 annotations at the time of this comparison; the separate [southward batch](../judique-south-review.md) extends it.

The pilot tests a practical workflow: inexpensive first-pass extraction from native crops, followed by source review and a separate placement stage. These results do not support unattended extraction or accepting a model's self-reported confidence.

## Results

Six crops contain 27 complete reference annotations. Three provisional readings/groupings are excluded from strict text scoring, leaving **24 clear references**. Edge fragments are recorded separately.

The counts below allow the explicitly documented **manual splitting and regrouping** of model output. They are more generous than raw-record accuracy and are not end-to-end acceptance rates. Superscript-c typography, case and whitespace are normalized; punctuation differences remain separate.

| Requested model / effort | Exact text after regrouping | Additional punctuation-only differences | Wrong wording / incomplete | Geometry outcome |
| --- | --- | --- | --- | --- |
| gpt-5.6-luna / medium | 17/24 | 1 | 4 / 2 | Valid bounds, but visual defects remain |
| gpt-5.6-terra / medium | 20/24 | 1 | 3 / 0 | Valid bounds, but visual defects remain |
| gpt-5.6-sol / medium | 21/24 | 1 | 1 / 1 | Valid bounds, but visual defects remain |
| DeepSeek V4 Flash Vision Experimental / provider default | 23/24 | 1 | 0 / 0 | Valid bounds; 24/29 records have observed box defects |
| Claude Opus 5 | Not run | — | — | Comparison set aside |

Luna, Terra, Sol and DeepSeek emitted 31, 31, 28 and 29 candidate records respectively. Different counts reflect split and merged labels as well as omissions; they are not counts of distinct sites. All 119 candidate records have syntactically valid boxes within their crop bounds. Visual inspection nevertheless found clipped text and wrong image regions.

## Findings that change the workflow

- **Confidence is not an acceptance gate.** Luna read the mineral annotation Barytes as Hawkes, Terra as Haynes, and Sol as Harvies, all marked clear. The project reference was re-inspected at enlarged native pixels; it remains Barytes. DeepSeek subsequently returned Barytes correctly. This is still a project reading, not independent human ground truth.
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

**Current decision:** there is enough evidence to proceed with the reviewed assembly line. Use DeepSeek V4 Flash **Vision Experimental** for the next candidate pass through OpenCode while the existing credits are available. Its text score was strongest here, including the mineral label missed by the other models. The coordinator must review whole crops for omissions, fix grouping and source rectangles, and keep modern placement separate. Scripts handle packaging, validation and bookkeeping. This is an operational choice from a small pilot, not a general model ranking or proof of total cost savings.

## Reproduce and audit

- [Crop manifest](crops.json): original pixel windows, exact local PNG hashes and equivalent direct IIIF context links. Raw scans and crops remain outside Git.
- [Frozen project reference](reference.json): copied from baseline commit `b8e14ed01e36fc9d91581b5e561085283dc570ad`, which predates the pilot. No reference transcriptions were changed to match worker output. Worker summaries arrived while packaging the reference, before candidate JSON was opened; this timing is recorded explicitly.
- [Worker prompt](worker-prompt.txt): shared extraction instructions. Workers received only their assigned PNGs and the prompt, with no inherited conversation.
- [Run records](runs.json): requested model/settings, packet sizes and raw-output hashes.
- Raw responses: [Luna C01–C02](luna-c01-c02.json), [Luna C03–C04](luna-c03-c04.json), [Luna C05–C06](luna-c05-c06.json), [Terra](terra-c01-c06.json), [Sol](sol-c01-c06.json). [DeepSeek](deepseek-c01-c06.json) adds the OpenCode run. These files intentionally preserve incorrect model output.
- [Adjudication](adjudication.json): every reference-to-candidate mapping, manual text reconstruction and observed box defects. [Results](results.json) are computed from those dispositions.

Run `python3 docs/fletcher/label-extraction/luna-pilot/verify.py` to check the archive's raw-response hashes, dimensions, IDs, reference mappings and score arithmetic. Add `--crops /path/to/crops` to check all six PNG hashes. This verifies recorded data, not the correctness of visual readings. The verifier uses assertions; run without Python's optimization flag.

Local verification passed for all 119 candidate records and six image hashes. All 119 emitted label excerpts were visually inspected. The current Fletcher suite ran 257 tests: 249 passed and eight optional image-dependency tests skipped. No renderer or geographic placement changed.

The native source comes from the separate **Georeference Fletcher map sheet** task. This text-reading pilot does not modify that task's fixed geographic evaluation windows, observations or acceptance evidence. Do not use these labels to tune its evaluation and still describe it as independent.

## DeepSeek through OpenCode

The successful run requested `deepseek-v4-flash-vision-exp`, recorded under the existing DeepSeek provider in every assistant message. Ordinary V4 Flash is text-only; the [official vision variant](https://api-docs.deepseek.com/guides/vision/) is required for images. The same six PNG hashes and frozen reference were used. No benchmark candidate was imported into the 93-annotation inventory.

DeepSeek returned all 24 clear-reference texts after manual regrouping, with one punctuation-only difference: `Chisholms` lacks the reference apostrophe. **23/24 is not raw-record accuracy:** six clear references needed a split, merge or both. Shop/P.O. and Mill/Brook were wrongly grouped; the provisional Quartz/Hills/Mill/Falls area remains unresolved. Its correct strings often had poor rectangles: 24 of 29 records have observed clipping, displacement or incomplete coverage. McEachern's rectangle falls below the text, and the Mabou boxes omit substantial words.

The successful fresh session took **639 seconds (10.65 minutes)**, with 58 local crop/rotation calls and 58 successful image reads across 43 completed steps. OpenCode reported 12,896 input tokens, 961,152 cache-read tokens, 11,239 output tokens and 13,723 reasoning tokens, totaling 999,010 across repeated contexts. Its displayed cost was zero because this custom model had no price metadata; **the actual debit is unknown, not zero**. This run demonstrates useful text reading, but does not establish a throughput or total-cost advantage over Sol.

Two setup attempts preceded the scored run. Image reads were denied because OpenCode matches read rules against relative paths; the first also exposed macOS `/tmp` canonicalization. One produced a restricted response and the second was stopped. Neither was scored or supplied to the successful fresh session. The fixed rule allowed PNG reads only within the isolated packet and the fixed crop helper; other tool access remained denied. Provider-default reasoning and OpenCode's image/tool adapter differ from the Codex medium-effort runs. DeepSeek also documents server-side image resizing, so identical uploaded PNGs do not establish identical visual preprocessing across providers.

[Run receipt and setup-attempt counters](deepseek-opencode-run.json) · [Exact adapted prompt](deepseek-opencode-prompt.txt) · [Process-local configuration](deepseek-opencode-config.json) · [Crop helper](deepseek-crop-helper.py). These preserve the actual run setup; their packet paths are local to that run. The API key remains in the existing user configuration and is not archived. Raw event streams, full session exports and imagery remain outside Git; their recorded hashes provide local provenance.

## Limits and untested model

The six crops were selected for representative difficulty from already inventoried areas, not randomly sampled or independently transcribed by a human. One run per configuration is insufficient to rank model families generally. Luna used three two-crop workers; Terra and Sol each used one six-crop worker, so packaging is a confounding factor. No current-model pricing or Codex allowance multiplier was used to infer actual cost. Token consumption was not measured for the three Codex configurations. DeepSeek’s OpenCode counters and elapsed time are recorded above. Billed cost and active correction minutes were not measured for any configuration.

The requested Claude Opus 5 run did not produce candidates because a fresh CLI request failed authentication. The user reported a working existing CLI session and then chose to continue without Claude. No account changes were made. **Opus has no score and no failed-quality result.** The prepared blind packet remains outside Git; another model comparison is not a prerequisite for extraction.

## Attribution

David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries. Source imagery follows [collection terms](https://www.davidrumsey.com/about/copyright-and-permissions) and [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/); see the existing [permission record](../../../../reports/fletcher/INVENTORY.md). Cropping, transcription candidates and evaluation notes are project work. Software licensing does not replace source-image terms.
