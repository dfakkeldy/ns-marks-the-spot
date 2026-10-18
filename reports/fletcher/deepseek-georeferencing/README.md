# DeepSeek Judique georeferencing trial

**Result: reject this DeepSeek workflow for unattended control-point placement.**
The completed 28-case batch found only **4/24** positive points within the frozen
15-source-pixel tolerance. It accepted three of four deliberately mismatched
pairs; the fourth produced no answer. No trial point was imported or fitted.

| Measurement | Format-normalized result | Frozen requirement |
| --- | ---: | ---: |
| Positive points within 15 native source pixels | 4/24 (16.7%) | At least 18/24 |
| Correct among all claimed matches | 4/25 (16.0%) | At least 95% |
| Explicit mismatch rejections | 0/4 | 4/4 |
| Positive matches outside tolerance | 18 | — |
| Positive cases without an answer | 2 | — |
| Median / maximum error among 22 positive matches | 58.4 / 187.7 source pixels | — |

These results recover exactly one JSON answer from each of 25 prose-wrapped
responses without changing any answer. The strict parser accepted **0/28**:
25 formatting failures and three generations ending at their output/reasoning
limit (K01, K14, K15). That integration failure is recorded separately; it is
not presented as zero geometric accuracy. All three numerical gates fail even
after format recovery. Source pixel distances are **not ground metres**.

The coordinator visually checked all 25 returned crosshairs. The four numerical
passes (K02, K12, K16, K26) identify the intended features. Failures include wrong
tributaries, pins on geological markings, displacement from correctly named
features, and unsupported assumptions that the target lies at the crop centre.
K06 identifies the right junction but misses by 16.1 pixels; the 15-pixel gate
was not relaxed. This is a coordinator audit against the reviewed project
reference, not a new independent human acceptance or survey.

The corrected batch completed in **24 minutes 46 seconds with four workers**,
with no timeouts or retries. Receipts confirm the requested provider/model on
all 28 cases. Completed steps report 1,945,331 total tokens: 108,217 input,
27,095 output, 428,515 reasoning and 1,381,504 cache reads. This excludes the
seven discarded setup attempts and preparation/review time. Billed cost is
unknown; human review time was not measured.

Keep DeepSeek outside automatic georeferencing acceptance. Its separate
[label-reading trial](../../../docs/fletcher/label-extraction/luna-pilot/README.md)
can still support reviewed transcription; this trial supplies no new evidence
for OCR quality. The earlier reviewed correspondence workflow remains the
reference for further automation. Faster parallel execution does not make these
incorrect coordinates usable. No further prompt variants were run.

## Evidence

- [Normalized geometric scores](normalized-scores.json) and
  [strict integration scores](strict-scores.json).
- [Unedited final text](raw-final-responses.json),
  [extracted answers](normalized-responses.json), and
  [visual adjudication](visual-adjudication.json).
- [Per-case receipts](run-receipts.json), [batch usage](batch-receipt.json),
  [discarded setup attempts](setup-attempts.json), and
  [verification](verification.json).
- Seven crosshair comparison pages were generated locally outside Git in
  `/Users/dfakkeldy/Downloads/judique-deepseek-review/`. Recreate them with
  `render_review.py --packets <packet-directory> --scores normalized-scores.json --out <directory>`.

## Trial design

This tests the same DeepSeek vision provider used for Fletcher label extraction
on **24 reviewed physical-feature correspondences and four deliberately
mismatched pairs**. Each fresh worker receives historical detail/context and a
modern vector image with the target marked. It must return a historical pixel
coordinate or abstain. The trial does not change any production controls or warp.

The trial is local correspondence matching, not automatic sheet discovery:
reference coordinates were used by the coordinator to select useful source
windows, but no historical target crosshair or answer coordinates were given to
DeepSeek. All historical target offsets vary within the crop. Source detail,
context and modern reference geometry are explicit image inputs, not a live
browser session. Only two fixed-helper close-ups are permitted per case.

## Interpretation and scoring

The frozen tolerance is **15 native source pixels**. Positive coverage requires
at least 18 of 24 correct coordinates, accepted-match precision at least 95%, and
explicit rejection of all four mismatches. A separate source-side visual audit
checks feature identity. The user reviewed these project correspondences;
neither their coordinates nor this trial are independent survey truth.

The initial runner encountered execution problems, recorded in
[SETUP-CORRECTION.md](SETUP-CORRECTION.md). Seven initial attempts produced no
valid answer before the runner was stopped. The corrected batch retained all
112 input image hashes and scoring thresholds, restored the previously used
16,384-token output limit, and fixed helper permission/export mechanics.

There are two separately recorded scoring views:

- **Strict integration:** the frozen parser expects one JSON object, optionally
  enclosed in a Markdown fence. Other responses remain format failures.
- **Format-normalized diagnostic:** after K04 returned prose followed by JSON,
  a deterministic extractor was added. It accepts exactly one valid,
  case-matching JSON object and changes no coordinates, status or evidence.
  See [FORMAT-DIAGNOSTIC.md](FORMAT-DIAGNOSTIC.md). This prevents recoverable
  formatting from hiding geometric errors while retaining the primary result.

A coordinate near a correct feature does not by itself prove correct identity.
Conversely, naming the right brook or headland does not make a displaced pin
usable. The review figures overlay the raw returned coordinates; no point is
snapped, adjusted or imported.

## Reproduction

Python preparation needs NumPy and Pillow. The image renderer uses the macOS
Helvetica font for the exact archived PNG hashes. The inference runner uses the
existing OpenCode `deepseek-cc-switch` provider configuration; it neither reads
nor copies the API key. The custom agent is isolated from repository/reference
files, and its only executable helper crops the assigned images. Source imagery,
raw event streams, full session exports and temporary packet state stay outside
Git. OpenCode 1.18.29 and `deepseek-v4-flash-vision-exp` were requested.

From the repository root:

```sh
python reports/fletcher/deepseek-georeferencing/prepare.py \
  --source /path/to/native-sheet19/sheet19.png \
  --reference-dir /path/to/fletcher-matching-benchmark \
  --out /tmp/judique-packets

python reports/fletcher/deepseek-georeferencing/run.py \
  --packets /tmp/judique-packets/packets \
  --out /tmp/judique-runs \
  --python /path/to/python-with-pillow \
  --workers 4

python reports/fletcher/deepseek-georeferencing/score.py \
  --runs /tmp/judique-runs --out /tmp/judique-strict

python reports/fletcher/deepseek-georeferencing/score.py \
  --runs /tmp/judique-runs --out /tmp/judique-normalized --normalize-format
```

The API run uses the user's service credits and is nondeterministic. Score replay
from archived answers is deterministic. The packet builder refuses to overwrite
an existing reference manifest. The runner refuses to repeat a completed model outcome, including format or
budget failures;
any authorized transport retry is recorded as another attempt. Generated
close-ups/counters are cleared for a fresh retry. No scored geographic answer
should be retried to seek a better result.

## Provenance

- Initial protocol/packet freeze: `40dfb360`.
- Corrected execution/reference freeze: `2773a063`.
- [`PROTOCOL.md`](PROTOCOL.md), [`worker-prompt.txt`](worker-prompt.txt), and both
  reference manifests preserve case selection, pairing, image hashes and gates.
- The reviewed reference is
  [`sheet-observations.json`](../visual-expansion/sheet-observations.json).
- Historical scan: David Rumsey Map Collection / David Rumsey Map Center,
  Stanford University Libraries, IIIF item `RUMSEY~8~1~2644~290012`,
  CC BY-NC-SA 3.0 plus the project's separately recorded permissions.
- Modern vectors: Nova Scotia NSTDB 1:10,000 water and roads, recorded in
  [`reference-receipts.json`](../matching-benchmark/reference-receipts.json).

The setup/model receipts record completed-step token counters. Cached contexts
are counted repeatedly; they are not unique image/text input. A custom-provider
cost display of zero reflects absent pricing metadata and does not establish
zero billed cost. Unfinished model steps may consume credits that are not
represented in completed-step counters.
