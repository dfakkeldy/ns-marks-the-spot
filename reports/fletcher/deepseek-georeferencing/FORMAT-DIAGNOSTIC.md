# Deterministic format normalization diagnostic

The first completed corrected-session case (K04) returned explanatory prose
followed by a complete answer JSON object. The frozen runner's strict parser
recorded it as a format failure. The raw answer and receipt are preserved.

Score the strict parser output unchanged as the primary integration result.
Additionally, compute a labelled diagnostic that extracts an answer only when
there is exactly one valid case-matching JSON object in the final text. Apply
this same rule to all cases, without changing coordinates, statuses or evidence.
Ambiguous multiple answers, malformed JSON and interrupted executions remain
failures. Do not call the model again for a prose-wrapped but recoverable answer.

The diagnostic distinguishes recoverable output formatting from feature identity
and placement errors. Its geographic thresholds are unchanged, but this parser
normalization was introduced after observing K04 and is not the frozen primary
parser. Report both outcomes and the number of normalized responses.
