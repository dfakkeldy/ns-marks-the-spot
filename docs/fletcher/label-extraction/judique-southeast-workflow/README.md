# Southeast batch: DeepSeek candidates and reviewed source inventory

Six native 1100 × 1250 source crops, three isolated workers, **69 raw candidates → 40 new reviewed annotations**, plus 9 candidates linked to earlier annotations and 1 excluded geological-code candidate. All candidates are accounted for in [adjudication.json](adjudication.json); multiple crop fragments may map to one annotation. No automatic import is allowed.

- [Final readable review](../judique-southeast-review.md) and [inventory](../judique-southeast.json)
- [Crop/hash and edge-context ledger](crops.json)
- [Model, token, timing and isolation receipts](runs.json)
- Raw responses: [west](west-raw.json), [middle](middle-raw.json), [east](east-raw.json)
- Exact prompts: [west](west-prompt.txt), [middle](middle-prompt.txt), [east](east-prompt.txt)
- Runtime model/permission configurations: [west](west-config.json), [middle](middle-config.json), [east](east-config.json)
- Fixed crop helpers: [west](west-crop.py), [middle](middle-crop.py), [east](east-crop.py)

Worker PNG packets and full event/session exports stay outside Git. Their hashes are retained. The process used the existing configured provider credentials without copying keys into this archive. Two simultaneous startups failed with a database lock; staggered restarts succeeded. One middle-worker attempt to append a directory listing to a crop command was denied by the tool permissions. All assistant-message model receipts identify `deepseek-cc-switch/deepseek-v4-flash-vision-exp`, with provider-default reasoning.

| Worker | Actual source crops | Raw records | Elapsed seconds | Completed steps |
| --- | --- | ---: | ---: | ---: |
| west | I01, I04 | 16 | 595.097 | 30 |
| middle | I02, I05 | 29 | 1605.476 | 71 |
| east | I03, I06 | 24 | 1096.58 | 37 |

The eastern worker returned `C01` and `C02` despite being assigned I03 and I06. The ordered attachments, image dimensions, read/crop calls and source content establish the explicit aliases recorded in its receipt. Raw candidate IDs are namespaced by worker. Two eastern candidate boxes exceed native image bounds; the audit requires those exact defects to remain recorded and validates the corrected final inventory separately.

The boundary audit also added PROPOSED RAILWAY TO WHYCOCOMAGH, whose first letter intersects I05. It is a reviewer addition, absent from all worker output.

Every raw rectangle was rendered against its assigned source image. Common defects include cut-off letters and boxes displaced below their text. Root rebuilt final source-pixel boxes and reviewed every retained excerpt, including individual letters in CRAIGNISH. Sol independently completed eastern/southern edge text and reviewed selected difficult names; uncertain surname endings remain tentative. This is supervised production extraction, not a new blind accuracy benchmark. It does not justify relaxing review gates.

OpenCode reports zero cost for this custom model because no price metadata is configured. **Actual billed cost is unknown.** Token counters are archived as emitted; summing cached contexts does not count unique input tokens.

## Reproduce the integrity audit

```sh
python3 docs/fletcher/label-extraction/judique-southeast-workflow/verify.py
python3 docs/fletcher/label-extraction/judique-southeast-workflow/verify.py --crops /path/to/exact-batch-pngs
```

The optional directory contains I01–I06 and E01–E06 from the ledger. Source PNGs are regenerated losslessly from the hash-bound native mosaic; edge windows finish listed labels only. The audit confirms 29,100,000 pixels of four-batch core coverage, not a percentage of labels extracted or geographic placement accuracy.

For the next batch, keep staggered OpenCode startup and explicit packet isolation. Replace the generic JSON example's crop IDs with the assigned IDs to reduce alias mistakes; still validate returned IDs, dimensions and boxes before review. Retain whole-crop inspection and deliberate cross-batch deduplication. Do not convert source boxes to modern pins as part of packaging.
