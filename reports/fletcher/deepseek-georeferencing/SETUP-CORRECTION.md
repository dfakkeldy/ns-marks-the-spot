# Setup correction before the scored batch

Initial freeze: `40dfb360`. Seven cases were dispatched before stopping the
runner. None produced a valid final coordinate/abstention JSON answer. Three
completed without a valid answer and four were interrupted. Files are retained
locally under `/private/tmp/judique-deepseek-georef-20260905/runs`.

The initial 4,096-token output limit was consumed by internal reasoning,
producing `length` finishes without final JSON. Restore the 16,384-token limit
used in the existing successful label trial. Keep the same 8-step and 10-minute
limits. Some crop commands included `cd` to the assigned packet followed by a
relative helper path; allow those exact packet-local forms as well as the
original absolute helper invocation. All other commands remain denied.

The prompt's two-close-up limit was not consistently obeyed. The corrected
packet helper enforces two successful crops, including parallel invocations.
Neither this counter nor its error supplies answer information. The successful
label trial's fixed helper pattern remains the only executable tool.

OpenCode's JSON session export was truncated when captured through a pipe.
Write it directly to a regular file, then parse model metadata. This affects
provenance recording, not inference or coordinate scoring.

The scored batch starts in fresh sessions with the same 112 image hashes,
case ordering, target/source pairings, source offsets, prompt and scoring gates.
Only helper/configuration mechanics change. Both reference manifests are saved.
No accepted answer was discarded or rerun for quality. This correction is not a
new blind experiment; report setup effort separately from completed inference.
