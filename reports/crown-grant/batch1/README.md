# Crown Grant batch 1 — 19 September 2026

**Review update, 22 September 2026:** The user delegated final judgment and
explicitly allowed accepting a sheet above the RMS target when a defensible
improvement is unavailable. All five existing georeferences are now
**accepted for qualified historical research overlay use**. This does not mean
that every original accuracy/coverage gate passed. See
[`review-decision-20260922.md`](review-decision-20260922.md) for component-level
limits, model comparisons, and the exact scope of acceptance. No source imagery
or transform was changed or published by this review. The batch narrative below
records the original 19 September assessment and pause.

Requested limit: FIVE sheets, sequential processing, then pause. No sixth sheet,
background continuation, public imagery, or production activation is authorized.

The user also accepted these delivered artifacts in this task and authorized a
separate twenty-sheet Cape Breton batch. See [batch 2](../batch2/README.md).
`user-acceptance.json` pins the original approved raster/fit hashes to the batch 1
merge on nightly. The five-sheet limit and pause below describe batch 1 only.

## Frozen queue

002 → 003 → 004 → 004a → 005. Ascending official identifier, preserving the
insert; the official index's first four footprints form a contiguous run and 005
starts the next column. No stronger geographic alternative warrants departing
from the requested default. The live index contains 138 links, with absent
numbers 001, 012 and 134. Inventory saved in `official-index.json`.

Existing work: July feasibility PRs #141 and #145; no existing sheet controls,
warps or applicable open PR located in nightly or the local artifact inventory.

## Acceptance criteria, fixed before scoring

Purpose: historical grant-index research overlay, never parcel/title evidence.
At 1:31,680, 1 mm on paper equals 31.68 ground metres. Project-specific gates:
independent physical-check RMS ≤50 m initially (updated to ≤100 m by user request), median ≤40 m, empirical linear P95 ≤80 m,
maximum ≤100 m. These are research objectives, not an asserted map standard.
Aim for 20–30 checks where identifiable; acceptance requires at least 12 well
separated checks covering mapped northern/southern and coastal/interior regions,
edges and every separately positioned component. If a small component cannot
supply that coverage, assess it separately and retain a provisional status.
Report actual count, coverage, uncertainty, signed bias, and individual errors.
Use WGS84 geodesic ground distances; projected fitting residuals are diagnostic.
Physical checks remain excluded from fitting. Any checks used for repair/model
selection become diagnostics; preserve their earlier outcomes.

Prefer affine fitting. Use a curved model only with evidence of distortion and
adequate distributed controls. Inspect exact native crosshairs, complete mapped
coverage, orientation/distortion and the actual browser-rendered raster.
Numerical success does not override failed coverage or visual checks.

## Licensing and source review

The July report's no-reply statement is stale. The user reports a substantive
18 September licensing response directing this use to the provincial Open Data
Portal licence. Complete scans/base mapping and downstream distribution uses
remain unclarified. An unsent draft supplies no additional permission. No email
is sent by this task. Imagery remains in ignored `.crown-grant-local/`; public
records contain controls, measurements, code and provenance only.

Source: https://novascotia.ca/natr/land/grantmap.asp
Licence guidance: https://support.novascotia.ca/services/open-data-portal-licence
Preserve the original sheet warning and Province attribution. Any georeferencing
is a project modification; historical grants do not establish present ownership.

## July claims under audit

PROJ's installed EPSG database identifies 2961 as NAD83(CSRS) / UTM zone 20N and
2962 as NAD83(CSRS) / UTM zone 21N, contradicting the report's MTM identification.
The province's mapping-products description says 1:10,000 sheets cover about
four miles across, so a 10 km spacing alone cannot prove a 1:10,000 mapsheet grid.
Printed red-line datum, origin and grid identity remain unverified. Do not snap
an external tie to an assumed lattice. The July 72 m value is fitting RMS and
cannot establish an independent accuracy bound or whole-sheet acceptance.

## Revised RMS criterion

The user changed the RMS ceiling to **100 m** during the batch. Earlier 50 m
assessments and all coordinates/scores remain preserved. The current machine
record is `acceptance-criteria.json`; existing companion bounds remain unchanged
unless separately changed. RMS alone does not resolve unsupported coverage.

## Progress

| Order | Sheet | Original assessment | 22 September decision | PR |
|---|---|---|---|---|
| 1 | 002 | Provisional main-map assessment; unsupported inset | Accepted for research; inset placement unvalidated | [#520](https://github.com/dfakkeldy/ns-marks-the-spot/pull/520) |
| 2 | 003 | Complete main-sheet assessment, 12 independent checks | Accepted for research; median/P95 above goals | [#521](https://github.com/dfakkeldy/ns-marks-the-spot/pull/521) |
| 3 | 004 | 21 reference-audited island/coast checks; full raster | Accepted for research; tail errors/rocks limited | [#522](https://github.com/dfakkeldy/ns-marks-the-spot/pull/522), merged |
| 4 | 004a | Three cartographic components, full-source coverage | Accepted for research; Southern Seal unvalidated | [#523](https://github.com/dfakkeldy/ns-marks-the-spot/pull/523), merged |
| 5 | 005 | Separate main and Brier/Long Island inset assessed | Accepted for research; Long Island unvalidated | [#524](https://github.com/dfakkeldy/ns-marks-the-spot/pull/524) |

Assessed: 5/5; accepted for qualified research use: 5/5; demonstrated to pass
every original whole-sheet numeric and coverage gate: 0/5. Sheet 002's inset
remains unvalidated. No sixth sheet is included in this review.

## Local review

Review URL: http://127.0.0.1:8842/ (loopback only). Port 8765 was already occupied.
Private imagery root: `.crown-grant-local/` in this task worktree. Prepare with:

```sh
python3 tools/crown-grant/prepare_review.py --private-root .crown-grant-local \
  --leaflet /Users/dfakkeldy/Developer/ns-marks-the-spot/web/node_modules/leaflet/dist
python3 tools/crown-grant/serve_review.py --root .crown-grant-local/review --port 8842 --detach
```

At the original handoff, sheet 002 had a private full-content provisional render
and numerical/visual assessment. It was **not accepted at that time**, and its
inset remained unsupported. See its [record](sheet002/README.md). The 22 September
decision above accepts the existing fit for qualified research use while keeping
the inset unvalidated.

The review server supports a detached process, with readiness verified by its own
PID receipt and HTTP manifest response. Logs and the active PID are kept privately
beside the review directory. Detached-mode startup and an independent subsequent
HTTP request were tested before the persistent server replaced the initial session.

## Original batch handoff (19 September)

**PAUSED after exactly five sheets: 002, 003, 004, 004a, 005.** All have local
full-content rasters and assessment records; none is accepted for whole-sheet
geographic accuracy. No sixth sheet or background continuation is scheduled.
The updated 100 m RMS criterion is applied consistently; sparse/unsupported
regions and unchanged companion bounds remain explicit.

The detached review server remains on port 8842. Its current PID and logs are
recorded privately in `.crown-grant-local/review-server-8842.pid` and
`.crown-grant-local/review-server-8842.log`; private `REVIEW.md` records the exact
worktree and restart command. Keep this worktree for its private imagery.
