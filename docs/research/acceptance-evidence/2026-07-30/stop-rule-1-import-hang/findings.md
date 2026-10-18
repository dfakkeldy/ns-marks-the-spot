# UPDATE — partition test and failure-point isolation

Date: 2026-07-30 (continues README.md in this directory)
Runtime: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Control: receipt baseline `4c46ca276982ac9e4da593ee79b5a88503818511`
Browser: Chrome 150.0.0.0 / macOS 27.0 build 26A5388g

## 1. Partition result: the hang is UNIVERSAL, not size- or content-dependent

`web/src/test/fixtures/geopdf/ns-utm20-lgidict.pdf` — an in-repo synthetic
fixture of **2 KB** — reproduces the identical indefinite `Reading` state.

Same worker signature as the 3.2 MB real USGS file:

- geoPdfWorker `parse`    -> `topology-unsupported`  (correct fallback)
- geoPdfWorker `metadata` -> `ok:true`               (metadata SUCCEEDS)
- pdf.worker.min.mjs      -> goes silent, never terminates

CONCLUSION: no GeoPDF completes import in Chrome 150 on this machine, at any
size, at current nightly or at the receipt's own baseline. This is not a
threshold problem. There is no threshold to find.

## 2. Failure point isolated to a single PDF.js step

Action-level MessageHandler trace (2 KB fixture), main <-> pdf.worker:

```
t=17965  -> GetDocRequest      (cb 1)
t=17965  -> Ready
t=17967  -> GetPage            (cb 1)
t=17968  <- reply              (cb 1)
t=18012  -> [binary]           (cb 2)
t=18014  <- reply              (cb 2)
t=18013  -> GetOperatorList    (stream 1)
t=18015  <- stream chunk       (stream 1)
t=18017  <- StartRenderPage
t=18018  <- stream chunk       (stream 1)  x2
t=18021  <- obj
t=18021  <- stream chunk       (stream 1)
...      SILENCE. No further message. Never terminated.
```

The worker begins streaming the page operator list, emits `StartRenderPage`
and one `obj`, then stops. `renderTask.promise` (geoPdfSource.ts:225) never
settles, so the import promise never settles, so the UI stays on `Reading`.

## 3. Pending promise vs deadlocked worker

Requested distinction. Evidence:

- the worker is NOT terminated;
- it emits no `error` event;
- it did not respond to an injected liveness message (13 msgs before,
  13 after, 1.5 s wait).

CAVEAT, stated deliberately: PDF.js's MessageHandler may silently drop an
unrecognised `action`, so non-response is STRONG BUT NOT CONCLUSIVE evidence
of a wedged worker thread. What IS established: the worker stopped producing
output mid-stream, and the render promise is pending as a consequence.
Recorded as "worker stops mid-stream; render promise pending" rather than
asserting a hard deadlock.

## 4. Causes ruled out (each tested, not assumed)

| Candidate | Result |
| --- | --- |
| File delivery | byte-exact: 3,241,291/3,241,291, `%PDF-1.6`, `%EOF`, 4 ms |
| Repo SHA | reproduces at baseline `4c46ca276` |
| File size | reproduces at 2 KB |
| Registration family | reproduces on LGIDict and on real Measure |
| HTTP server | reproduces on python http.server AND vite preview |
| Missing PDF.js assets | all 201 present; cmaps/, standard_fonts/, iccs/, wasm/ present |
| Asset MIME | openjpeg.wasm, jbig2.wasm both HTTP 200 `application/wasm` |
| Console errors | none |
| Failed network requests | none |
| Browser major version | Chrome 150 — SAME major version the receipt records |

## 5. OPEN PROVENANCE QUESTION — receipt integrity

The receipt `docs/research/2026-07-28-geopdf-browser-acceptance.md` records a
COMPLETE Chrome 150 five-file matrix at baseline `4c46ca276`. That baseline,
rebuilt here from a clean `git archive` of the same SHA and served
independently, does not import a single GeoPDF on this machine.

Recorded as an OPEN QUESTION, not a refutation. Possible readings:

- (a) a machine- or profile-dependent factor not captured in the receipt;
- (b) the recorded matrix is not reproducible as written.

Repo SHA is excluded as a cause either way. A recorded pass that cannot be
reproduced at its own baseline is a receipt-integrity concern independent of
which reading is correct, and should not be silently carried forward.

## 6. Claims status

- NO browser acceptance state is claimed for any browser.
- A blocked import is NOT a fail. It is BLOCKED.

| Item | State |
| --- | --- |
| Stop rule 1 — post-reload raster | BLOCKED, unevaluable |
| Stop rule 2 — embedded coords / no GCP mode | UNREACHED |
| Stop rule 3 — long-task / request-body / retained-resource | PARTIAL |
| Chrome matrix | NOT RUN |
| Firefox | NOT RUN |
| Desktop Safari | WAITING_FOR_USER |
| Physical mobile Safari | NOT RUN |

Stop rule 2 note only: the metadata worker returns `ok:true` in ~67 ms, which
is consistent with embedded extraction but proves NOTHING about chooser
behaviour or GCP mode. No claim is made.

Stop rule 3 note: long tasks captured — only 2 exceeded 200 ms, max 193 ms,
both during page load. This describes a run that never completed. Not a pass.

## 7. Safari lane

safaridriver starts and listens on 4444, accepts the POST, and returns HTTP 500
after exactly 30 s: "The session timed out while connecting to a Safari
instance." Reproduced at 25/40/60/90/120 s client timeouts, Safari both closed
and running. No blocking dialog on screen (verified by screenshot).

The "Allow remote automation and external agents" setting IS enabled — in
Safari 27 it lives in **Settings -> Developer**, not the Develop menu, and the
absence of an `AllowRemoteAutomation` plist key is NOT evidence of it being
off. An earlier note in this session that treated the plist as authoritative
was wrong and is corrected here.

Outstanding step, requires admin rights: `sudo safaridriver --enable`.
Lane remains WAITING_FOR_USER. Safari will not be reported as passing.

When the Safari lane does run it MUST use a fresh Private window: this machine's
Safari currently holds seven NS Marks The Spot tabs carrying prior persisted
GeoPDF state (one visibly showing "RMS 0 m across 4 points" / "Back to scan"),
which would contaminate persistence and provenance cases. Record that fact in
any receipt produced from that run.

## 8. Harness limitation, NOT a product defect

`file_upload` over the browser bridge enforces a hard 10 MB per-call ceiling,
measured: 9,052,006 B accepted; 12,127,762 B rejected.

San Francisco South (12,127,762 B) and Hampton (35,264,037 B) therefore cannot
be delivered by the native file-input path in this harness.

**THE APPLICATION DID NOT REJECT THESE FILES. The browser bridge did.** A later
reader must not read this as a size bug in the product. Native-chooser proof
for those two files is UNPROVEN at `a75fef33c` for harness reasons alone.

## 9. Corpus provenance

Five recorded USGS files staged outside every git repository at
`/Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/corpus/`. All five sha256
values and byte counts verified against
`docs/research/2026-07-27-geopdf-external-corpus.json`:

| File | Bytes | sha256 (first 16) | Verified |
| --- | --- | --- | --- |
| ME_Isles_of_Shoals_20240805 | 5,831,077 | 9e0e5c17276b6ff0 | yes |
| NH_Isles_of_Shoals_OE_W_20150610 | 3,241,291 | 1e9d8c98ddea13d1 | yes |
| CA_Montara_Mountain_OE_W_20120515 | 9,052,006 | 756f06c2c1a826c1 | yes |
| CA_San_Francisco_South_OE_W_20211202 | 12,127,762 | 1e64eabdb4df545a | yes |
| NH_Hampton_20240808 | 35,264,037 | a4b29c41289e5d4d | yes |

No corpus PDF is inside any repository and none may be committed.

## 10. Local gates at a75fef33c (separate claim from everything above)

Fresh at this SHA, not carried forward:

- `npm ci --include=dev` — 329 packages, 330 audited, 0 vulnerabilities
- Node script tests — 12/12 pass
- Vitest — 1,057 passed, 1 skipped (92 files passed, 1 skipped)
- `npm run lint` — clean
- `npm run build` — passes, pre-existing large-chunk advisory only
- `npm run check:pdf-assets` — 200 assets checked

Local runtime proof ONLY. Not CI, not merge, not acceptance, not deployment.

Install trap worth recording: this shell environment sets `NODE_ENV=production`,
so a bare `npm ci` silently installs 57 packages and omits every devDependency
(no vite, vitest, typescript, eslint). `npm ci --include=dev` is required, and
yields the 329 the receipt records.

## 11. GEO_PDF_APPROVED_RULES

Confirmed empty at `a75fef33c`:
`export const GEO_PDF_APPROVED_RULES: readonly ApprovedGeoPdfRule[] = [];`

No producer-specific automatic main-map rule is approved, and none is
recommended here — the import path cannot currently be exercised end to end,
so no new selector evidence was gathered. The receipt's existing holdout
finding stands: `pdf-lib` returns null Producer for all 12 holdout files and
ArcSOC appears in Creator instead, so producer-keyed signatures cannot match.
Re-keying to Creator would define a NEW selector requiring a freshly frozen
independent holdout evaluation.
