# DeepSeek Judique correspondence trial

Run the user's existing `deepseek-cc-switch/deepseek-v4-flash-vision-exp`
provider through OpenCode. Test 24 reviewed new correspondences (T, C1–C3,
V01–V08, O00–O11) and four mismatched pairs, with four isolated cases in parallel.
The 15 older saved hand controls and eight warp checks are not trial targets.

Each case supplies an unmarked native 800 × 800 historical detail, the same
pixels with a coordinate grid, a 1600 × 1600 historical context resized to
800 × 800, and an 800 × 800 modern vector view. A red ring marks the modern
target. Water is blue and roads grey. Modern context spans 4 km in EPSG:3857.
The historical target has a seeded variable offset within its crop; it is not
always at the centre. Crop selection uses the reviewed answer to ensure it is
visible: this is local correspondence testing, not sheet-wide target discovery.
No historical crosshair, answer coordinates, earlier warp, earlier model outputs,
or reviewed point IDs are supplied to the worker. The reference and preparation
code stay outside the worker's permitted files. Each case has a fresh session.

The four negatives pair an otherwise normal historical crop with a reviewed
modern target whose true historical location is outside both supplied historical
windows. They test abstention on deliberately wrong-region packets; they do not
establish rejection of every plausible nearby wrong branch. Positive O01 retains
the difficult eastern/northwestern tributary distinction from the earlier draft.
Case IDs are shuffled with seed 20260905; IDs do not reveal positive/negative.

Workers return match / uncertain / no_match, local historical x/y for a match,
and brief topological evidence. They may use the fixed crop helper for at most
two closer looks. No browsing, shell access beyond that helper, repository reads,
other models, or reference access is permitted. Maximum 8 agent steps per case;
10-minute timeout. A failed transport/setup attempt is recorded separately and
may be retried once with the exact unchanged packet in a fresh session. Valid
answers are never retried to seek a better result.

Primary automatic correctness is a matched coordinate within **15 native source
pixels** of the reviewed location. Report all offsets, acceptance coverage,
precision, negative rejection, uncertainty, transport failures, wall time,
reported token counters and available cost metadata. A source-side visual audit
also checks whether each proposed crosshair identifies the intended branch;
coordinate proximity alone is not identity. Do not repair returned coordinates.
Ground offsets, if shown, use the reviewed draft TPS as a diagnostic reference,
not surveyed truth. No trial points are added to any fit or production record.

A provisional batch gate requires at least **18/24** positive cases correctly
located, at least **95%** of all accepted matches correct, **all four negatives
explicitly rejected** (uncertain is reported separately), and no visually
identified wrong-branch match among otherwise numerically correct results.
Transport failures count as unsuccessful cases for end-to-end coverage.
Thresholds and packets are frozen before inference. Keep the full first-run
results even if the gate fails; subsequent prompt variants require separate
stages, not overwriting this one.

This is a small, deliberately selected reproducibility trial against user-reviewed
project points. The coordinator knows the reference. Individual DeepSeek workers
do not receive it, but this is not independently surveyed or pristine blind
geographic validation. The raw imagery remains outside Git. Model self-reported
certainty is not a calibrated probability or an acceptance gate.
