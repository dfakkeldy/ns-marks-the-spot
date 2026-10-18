# Northern validation and join investigation — 9–10 September 2026

The active Mabou 36-control and Sheet 14 Hay 26-control fits are unchanged. Two
fresh local checks have supported identities and errors of **22 m and 82 m**.
Two other proposed checks remain ambiguous, and one was rejected before scoring.
This does not establish full-sheet acceptance or a successful five-point test.

The [protocol](protocol.json) pins both fits before scoring. Coordinates refer to
the original full scans. All errors below are approximate ground metres, not
Web Mercator metres. No new observation entered either fit.

| Sheet / point | Result | Interpretation |
|---|---:|---|
| 16 V03, Elgin eastern headwater fork | 22.0 m | Supported identity; existing upstream hand control deliberately excluded |
| 14 V01, lower Glendyer northwest tributary | 82.3 m | Supported identity; separate from the mill confluence |
| 16 V01, proposed Glendyer tributary fork | 711.2 m initial hypothesis | Identity unresolved after broader drainage review; not established map error |
| 16 V02, proposed upper Glendyer fork | 310.7 m initial hypothesis | Identity unresolved after broader drainage review; not established map error |
| 14 V02, proposed eastern tributary | Not scored | No identifiable matching tributary at the proposed native pixel |

Native crosshairs exposed initial crop/grid reading mistakes; these were corrected
before scoring and retained in `*-before-pixel-review.json`. The large Sheet 16
residuals prompted further inspection of the full drainage. A fork obscured by
geological hatching and inconsistent minor spurs prevent a confident junction
ordering. The [reviewed status](sheet-16-reviewed-status.json) supersedes the
initial identity claims in `sheet-16-checks.json`. The original scores are retained
so unresolved observations cannot silently disappear into a passing summary.

`review/` contains the paired native and modern views. Its Sheet 14 V02 image is
rejected evidence, not an accepted check. These are agent-reviewed observations;
the user has not been asked to approve or repair them.

## What the gap investigation establishes

No new physical boundary match was established strongly enough to change a fit.
The current Sheet 14–Mabou coverage gap remains **85.5–959.2 m** across longitude
−61.46° to −61.24°. These are edge separations, not feature errors and not proof
that the original survey omitted a strip.

The [crop sensitivity calculation](join-inset-sensitivity.json) restores eight
native y pixels at Sheet 14's southern edge and Mabou's northern edge, using the
same frozen transforms. It recovers only **48.3–53.9 m**. A gap of **33.1–905.8 m**
remains. Thus removing the conservative crop inset cannot solve the join.
This experiment does not change either crop or certify that every restored pixel
contains map content. No edge stretching, image filling or invented tie was used.

Replay from the repository root with the benchmark Python and GDAL CLIs on PATH:

```sh
python reports/fletcher/northern-validation-20260909/measure_inset.py
```

The next full-sheet work is recorded in [Sheet 11](../sheet11/README.md). Existing
tiles remain `fletcher-full-sheets-20260909.3`, and the existing digitization
handoffs and all hand controls remain unchanged.
