# Highway 19 extraction production

The requested priority is the full map area on sheets **22, 19, 16, 14**, moving
from Port Hawkesbury through Judique and Port Hood/Mabou to Cape Mabou and Broad
Cove. Geographic placement is deferred. This work does not change georeferencing
acceptance or the existing placement pilot.

## Production state

All four native-resolution mosaics are acquired and hashed. There are **145
overlapping source crops**: 35 on sheet 22, 35 on sheet 19, 40 on sheet 16 and 35
on sheet 14. The rectangles include the full map interiors and padded edges;
sheet 16 includes coastal labels extending west of its neatline. Native image
identity, source credit, licence links, crop hashes and offsets are in each
`sheet-N-manifest.json`. Marginal legends, graticule and compass apparatus are
outside the label inventory scope.

`status.json` and `sheet-N-candidates.json` are dated snapshots, not live status.
The queue started on 2026-09-06 with four OpenCode workers using the user's
existing `deepseek-cc-switch/deepseek-v4-flash-vision-exp` connection. A session
export confirms that provider and model. Actual billed cost is unavailable;
OpenCode's custom-provider zero cost is not evidence of free use.

**No sheet is finalized yet.** All 145 first-pass crops have finished. After seven
serialization repairs that required no model calls, 131 responses pass structural
validation, containing **1,156 candidate records**; 14 original responses remain
structurally unresolved, with their source crops reviewed separately. Candidate files deliberately retain duplicates,
tentative readings and unreliable model-estimated lettering boxes. Their
geometry is null. **185 source-reviewed annotations** are saved separately in
`sheet-22-reviewed.json`, with corrected boxes and explicit edge-review notes.
The original ten IDs are preserved. The first three rows have been visually
inspected (21 of 35 sheet 22 crops). Large ANTIGONISH lettering is assembled,
and tentative Shops has been corrected to Shop after separating an adjacent
building symbol. School-name typography, an obscured H in the large river title,
and geological structure scope holdbacks remain explicit.
Twenty-nine of the 185 records are printed spot-height labels;
they do not establish modern elevations or a vertical datum.
The first source checks found compass text incorrectly included, a clipped
"Rock dries" misread as "Rocky", and substantially displaced model boxes.
The native crops remain the authoritative evidence for all repairs. Three new
independent DeepSeek detail passes and rotated native excerpts helped correct
McMaster's Mill, Askilton, the school name, and General Line Road. The coordinator
rejected the model's incorrect grouping of General with Arm or Ice grooves.
See `north-row-review-evidence.json` for detail-crop provenance and adjudication.
Four further DeepSeek context passes supported the second-row review. Source
checks resolved Black Brook, the complete railway destination, and the survey
date **1875**, rejecting the model's imported 1879–80 report date. The broad
Strait context returned structurally valid JSON with many unsupported readings;
it is not accepted evidence. All thirteen letters of **STRAIT OF CANSO** were
instead checked directly in native source excerpts across rows 2–5. See
`second-row-review-evidence.json` for receipts and dispositions of all 75
second-row C02–C07 first-pass candidates. Lower-row text visible in these context
windows still needs the normal whole-crop review.
The western third-row review completes Colin Chisholm's Brook and Tate's Road,
corrects Winter Road, and separates the three Little Tracadie occurrences.
Four smaller DeepSeek packets cover the incomplete R03C05 attempt; all four and
the whole original crop have now been source-inspected. They do not replace or
certify the retained original response. Four further narrow context passes
support Kiln, J. McVicar, Crandall Road, and the lower river-title review. RIVER
INHABITANTS remains tentative where its H overlaps geological lettering.
See `third-row-west-review-evidence.json` for the earlier receipts and
`third-row-completion-review-evidence.json` for the later adjudication and
dispositions of all 124 original row-three candidate identities, including five
visible in the incomplete R03C05 response. Lower-row labels incidentally visible
in detail windows still await the normal coverage review.

## Continuing the queue

Large imagery, isolated image packets, prompts, key-free configurations, raw
event streams and receipts remain outside Git in:

```text
/Users/dfakkeldy/Downloads/fletcher-highway19-production
```

The original scans are under `~/Downloads/fletcher-sheet22/native/`,
`~/Downloads/fletcher-extraction-pilot/native-sheet19/`,
`~/Downloads/fletcher-sheet16/native/`, and `~/Downloads/fletcher-sheet14/native/`.
The local manifests record exact source paths. Never substitute earlier upscaled
JPEGs for these native mosaics.

Inspect the current process before starting another coordinator. The runner
holds an OS file lock to prevent duplicate spending, staggers CLI starts to avoid
OpenCode SQLite startup contention, and retains every started packet directory.
Existing successes are never rerun. A directory without a receipt may represent
a live or interrupted job; it is not automatically retried. Failed or truncated
outputs require explicit repair, preserving the initial attempt. Do not remove
failed directories to make status look complete.

The initial 16,384-token ceiling produced blank length-truncated answers on
dense crops. New starts request low reasoning effort and a 32,768-token ceiling.
These are supported request controls described by
[DeepSeek](https://api-docs.deepseek.com/guides/thinking_mode/) and configured
through [OpenCode model options](https://opencode.ai/docs/models/). The change
does not certify transcription quality. `--repair-incomplete` allows one recovery
attempt for a **blank, length-truncated** response, archiving the original under
`previous-runs/`. It never reruns a crop that already returned text or a valid
answer. Seven field-name or serialization failures were recovered without model calls; see
`format-repairs.json`. Unresolved descriptions without coordinates remain
explicitly unlocated instead of receiving invented boxes.

```bash
python3 -m tools.fletcher.extraction_queue run \
  --root "$HOME/Downloads/fletcher-highway19-production" \
  --opencode "$HOME/.opencode/bin/opencode" --workers 4 --repair-incomplete

python3 -m tools.fletcher.extraction_queue collect \
  --root "$HOME/Downloads/fletcher-highway19-production" \
  --out docs/fletcher/label-extraction/highway19-production
```

Preparation requires Pillow; running and collecting use the Python standard
library. The prepared packets are immutable. `prepare --help` documents the
source, sheet and coverage arguments. The local queue processes a sheet's first
pass before advancing north. The task's 30-minute continuation checks advance
review and repair; they should report finalized sheets or actionable problems,
not every unchanged check. Pause that continuation when all four sheets finish.

## Review and finalization

1. Inspect each complete native crop against its candidates, including empty
   returns and stripes. Use DeepSeek close-up passes for dense, clipped or
   uncertain areas. The fast first pass has no tool access; it is not the final
   adjudicator. Some outputs exhaust their reasoning budget without returning
   JSON, while others invent field names for unresolved regions. Preserve those
   outcomes and repair them explicitly.
2. Exclude unit codes, report references, compass labels and unnamed symbols.
   Add missed labels; retain uncertain readings visibly. Do not force a plausible
   personal name from modern geography or external knowledge.
3. Reconcile overlapping crops and multipart lettering using source pixels.
   Identical names at distinct printed locations remain separate. Cropped name
   fragments must link to a full occurrence or remain unresolved.
4. Reconcile sheet 19 against `judique-pilot.json`, `judique-inland.json`,
   `judique-south.json`, and `judique-southeast.json`. Preserve their existing 133
   IDs. Do not merge raw candidates into those files automatically.
5. A finalized transcription requires a complete crop coverage audit, duplicate
   adjudication and an explicit unresolved-reading list. Label boxes and feature
   locations are separate: retain crop provenance even where precise lettering
   boxes still need work, and keep all geographic geometry null. A model's
   `clear` classification and a successful subprocess do not establish source
   accuracy or completeness.

Use `F22-HAW-186` onward for additional sheet 22 reviewed annotations. Do not
renumber existing IDs. Next inspect R04C01 eastward and reconcile overlap with the
reviewed rows. The C05-NW/NE/SW/SE detail answers under `review-20260906-03` have
been source-reviewed; do not rerun them. Narrow lower-edge contexts under
`review-20260906-04` can be reused during row-four review. The river-title H
remains partly obscured; do not manufacture a clearer reading from model guesses.
Reuse the existing RAILWAY, INHABITANTS and HORTON-EDGE detail packets under
`review-20260906-02` for lower-edge context; do not rerun them. Prefer smaller
windows over another broad STRAIT model pass. The survey and regional strait
annotations are already complete; their lower-row pieces are duplicates.
The first-pass queue has stopped normally; do not restart successful packets.
Keep private residence observations out of public data.
Publish incremental reviewed work to this task's PR against `nightly`; do not
merge or deploy without separate authorization.

## Verification

`python3 -m unittest discover -s tools/fletcher/tests -t .` covers the existing
Fletcher pipeline and seven extraction queue tests: full tiling coverage, invalid
frames/boxes, duplicate identities, preservation of unreviewed states during
export, no duplicate calls on resume, and bounded recovery eligibility.
Native-image spot checks and lettering contact-sheet inspection are
separate from software validation. The source hash and crop-offset checks do not
prove that a model's guessed box actually encloses a label.
