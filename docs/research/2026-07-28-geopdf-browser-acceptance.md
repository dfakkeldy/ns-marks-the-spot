# GeoPDF browser acceptance receipt — blocked

Date: 2026-07-28 (updated 2026-07-29, extended 2026-07-31)

Baseline runtime commit: `4c46ca276982ac9e4da593ee79b5a88503818511`

Correction runtime commit: `fea8681385bf5ab2d62cc8e82f28839de1ca3a71`

Earlier physical-evidence `nightly` commit:
`7656364a6c16791a6334d0c8179e1c6c4cd01248`

Current integrated `nightly` commit:
`cfabf37bf3b8314c8b073533951e2ee7c88aa601`

Candidate parser commit: `ad1016b734abafded493443bc6a8be4229609448`

Candidate layout commit: `ae7d5700963ee7457d791c6c59df8383cee9cc09`

Decision: **BLOCKED**. PR #188, hosted CI, and merge are complete. The physical
verification work is `WAITING_FOR_USER` because the iPhone is unavailable, and
the exact merged desktop matrices are waiting because the Mac is locked and
supported foreground control is unavailable.

## 2026-07-29 candidate correction

The physical evidence below was reclassified after process diagnostics and
bounded reproduction rather than accepted as a terminal harness failure.

For the 5.8 MB Maine import, Mobile Safari displayed “This webpage was reloaded
because a problem occurred.” The MobileSafari application process survived,
while its WebContent process disappeared and was replaced. The latest available
Jetsam report predated the fresh run, so it is corroborating memory-pressure
evidence rather than an exact crash classification.

The Maine PDF contains a 9,430×11,386 source image (107,369,980 pixels) plus
85 large strips. PDF.js 6.1.200 was using its default adaptive maximum-image-area
probe before resizing to the application's at-most-4,096² preview. Candidate
`ad1016b73…` now passes a finite `canvasMaxAreaInBytes` of 64 MiB, exactly
4,096² RGBA bytes. A focused regression was observed RED without that option
and GREEN with it. This is a per-image resize budget, not a total process-memory
ceiling and not proof of exact Jetsam causation.

Chrome 150 then completed the complete five-real-file matrix on
`ad1016b73…`: all 16 embedded frames were selected explicitly from initially
unselected choosers, all used four embedded points, all selection/provenance
states survived reload, and the Maine import completed without a page-process
reset. Sole Measure/LGIDict placement, page-1-of-2 reporting, plain-PDF manual
fallback, the 35 MB Hampton case, and warning/error logs also passed.

That matrix exposed a separate 320×640 overflow in the Hampton user-map row.
Candidate `ae7d57009…` adds only scoped emergency wrapping for imported-map copy
and removes the opacity range input's 2 px user-agent margin. Strict RED/GREEN
style regressions and an exact production-browser rerun passed. Final
`clientWidth/scrollWidth` measurements were card 229/229, group 255/255, panel
287/287, document 320/320, and an ordinary row 255/255; the long filename and
provenance remained readable and Chrome logs were clean.

The legacy post-reload physical result still needs one exact rerun that uses a
persisted GCP's **Zoom to point** control before judging the raster. Desktop
Chrome proved that reload preserved the raster and GCPs while returning the
viewport to the default Nova Scotia centre; moving to the persisted Maine
extent made the raster visible. This does not retroactively pass the physical
legacy case. The iPhone is currently unavailable, so both exact physical cases
remain `WAITING_FOR_USER`.

## 2026-07-29 merged publication and exact-artifact boundary

PR #188 passed hosted change classification, web tests/build, and the repository
build gate, then merged to `nightly` as
`cfabf37bf3b8314c8b073533951e2ee7c88aa601`. No deployment or promotion was
performed.

The dedicated task worktree was fast-forwarded to that exact merge commit.
`npm ci` installed 329 packages with zero vulnerabilities; all 12 Node script
tests and 1,015 Vitest tests passed with one Vitest test skipped; lint and the
production build passed; and the 200 pinned PDF.js assets were checked. The
build retained only the existing large-chunk advisory.

Fresh exact-merge previews were served at `http://127.0.0.1:4188/` and
`http://127.0.0.1:4189/`. The first Chrome chooser attempt was discarded after
the control harness timed out while the Maine import continued, and the retry
created duplicate records. A fresh-origin restart was then blocked when
supported desktop control reported that the Mac was locked and automatic unlock
was paused because physical input had been detected. This is a harness blocker,
not a product pass or failure. No post-merge Chrome, Firefox, or Safari matrix
result is claimed from those attempts.

The complete rendered matrix passes in Chrome 150, Firefox 146.0.1, and desktop
Safari 27.0 on the baseline SHA. A physical iPhone 12 Pro run also proves the
chooser, explicit legacy-frame selection, embedded-point inspection, and
provenance persistence.

The correction SHA replaces the unreliable iPhone `ImageBitmap`-only path with
a cancelable HTML-image fallback and bounds high-DPR canvas allocation to the
viewport. Exact merged `nightly` was then tested from a fresh Private-tab
origin on the physical iPhone. The 3.2 MB legacy file reached an unselected
three-frame chooser, accepted an explicit `Map Layers` choice, and rendered
conclusively with OpenStreetMap disabled. After reload, the record and
`chosen by you` provenance persisted, but the raster did not repaint after
waiting, an off/on cycle, or a pan.

The 5.8 MB Maine import on the earlier exact merged artifact also returned immediately
to the startup licence dialog and created no record. The feature therefore
remained physically failed and had not completed the full post-fix desktop
diagnostic matrix at that SHA. Every
multi-frame GeoPDF still requires an explicit user choice.

## 2026-07-31 extension — Firefox 152.0.6, Chromium blocked, Safari blocked

This section records work done on branch
`feature/web-geopdf-browser-acceptance-20260730` against nightly
`a75fef33c1004943465b6b95713c7f28201fd0f5`, served from that worktree's `dist`
at `http://127.0.0.1:4340`. Full evidence is under
`docs/research/acceptance-evidence/`.

**This section changes the decision to nothing. It stays `BLOCKED`.** It settles
one stop rule, adds coverage the receipt did not have, and opens two questions
the receipt did not record. It closes **no** line item the receipt left open —
for the reasons stated in each subsection.

### Stop rule 1 — settled as `PERSISTED_BUT_OFFSCREEN`

The post-reload blank raster is **not** lost bytes and **not** a genuine blank
render. Across all five real USGS files on Firefox 152.0.6, three outcomes were
discriminated rather than inferred: the stored bytes were read back from
IndexedDB and reconstructed to an image (proving the bytes survive), the
pre-reload render was captured, and the post-reload viewport was captured both
before and after using a persisted GCP's **Zoom to point** control. In every
case the raster was present and correct once the viewport moved to the persisted
extent. The reload returns the viewport to the default Nova Scotia centre; the
raster is off screen, not absent.

This is the exact discrimination the 2026-07-29 note said was required. **It was
performed on desktop Firefox, not on the physical iPhone**, so it supplies a
strong mechanism for the physical result without closing it. Physical Mobile
Safari stays `WAITING_FOR_USER`.

### Chooser matrix — 16/16, zero preselection, no GCP prompts

Sixteen frames across four multi-registration files were selected explicitly
from choosers that had no checked radio on arrival, with `Use this frame`
disabled until a choice was made. No frame was silently selected, and no
supported frame requested manual GCP entry. Each fixture asserted
`recordsBeforeImport == 0` after a per-file IndexedDB and
`user-map-ui-state-v1` reset, so no reading describes an earlier file.

Both files over 10 MB — San Francisco South (12,127,762 B) and Hampton
(35,264,037 B) — were imported through a genuine native `<input type=file>`,
closing the harness ceiling that had made them unprovable on the Chrome bridge.
That ceiling was a harness limit, never a product size limit.

### Manual-points boundary — holds in both directions across 13 fixtures

Measured on the repository's own tracked fixtures, in both directions.
Registration that is missing, invalid, or unsupported-CRS falls back to manual
with a **distinct and truthful** reason (`absent`, `invalid`, `unsupported-crs`
are not collapsed); readable supported registration is never pushed to manual;
two or more candidates return `selection-required`; an unreadable file produces
a typed error and no record. Page-count reporting (`Page 1 of 2 imported`) and
the non-leakage of a page-2 registration into page 1 also passed.

### What this extension does NOT close

- **Firefox 152.0.6 is not the receipt's 146.0.1.** These results *extend* the
  record. **No Firefox line item the receipt left open is closed by them.**
- **The 200 ms long-task diagnostic stays OPEN.** `longTaskApiSupported` was
  `false` for all 13 fixtures: Firefox does not implement the Long Tasks API, and
  an empty `PerformanceObserver.supportedEntryTypes` is **no instrument, not no
  long tasks**. The threshold cannot be satisfied on any Firefox lane. It needs a
  Chromium lane, and Chromium is blocked; Safari was the remaining candidate
  instrument and could not be reached (below).
- Import-time request bodies and retained-resource release remain uncaptured on
  this lane. No local-only-network claim and no resource-release claim.

### Chrome and Chromium — import hang, still `BLOCKED`

No GeoPDF completes import in Chrome 150 on this machine at any size — a 2 KB
in-repo synthetic fixture reproduces the identical indefinite `Reading` state as
a 3.2 MB real USGS file. It is not a size threshold; there is no threshold to
find. The failure is isolated to a single PDF.js step: the worker streams the
page operator list, emits `StartRenderPage` and one `obj`, then stops producing
output. `renderTask.promise` never settles, so the import promise never settles.

Recorded as **"worker stops mid-stream; render promise pending"**, deliberately
not as a proven deadlock: the worker is not terminated and emits no `error`, and
it did not answer an injected liveness message — but PDF.js's `MessageHandler`
may silently drop an unrecognised action, so non-response is strong but not
conclusive. Ruled out by test, not by assumption: file delivery (byte-exact),
repo SHA, file size, registration family, HTTP server, missing PDF.js assets,
asset MIME, console errors, failed requests, and browser major version.

### Desktop Safari — `BLOCKED`, zero cases run, no state claimed

`sudo safaridriver --enable` was run by the user and the lane was retried on
2026-07-31. Session creation still fails: HTTP 500 after 30 s, on **two
independent drivers** — the pre-existing one and one started fresh after the
`--enable`, which rules out stale driver authorization state. The driver's
`--diagnose` log contains the HTTP layer and nothing else; the request never
reaches a Safari instance.

Both documented remedies are now applied — the Settings → Developer toggle is
enabled (verified visually and carried forward) and `--enable` has been run — and
neither changed the outcome. **`PerformanceObserver.supportedEntryTypes` was
never read in Safari, so Safari's Long Tasks support is `UNMEASURED`** — which is
not "Safari does not support it" and certainly not "no long tasks".

No Safari window was opened, private or otherwise, so the **clean-profile
requirement is unexercised, not satisfied**. This machine's Safari holds seven
NS Marks tabs carrying prior GeoPDF state (one showing `RMS 0 m across 4
points`); a fresh Private window remains mandatory whenever this lane runs.

### Two questions this extension opens

1. **Receipt integrity.** This receipt records a complete Chrome 150 five-file
   matrix at baseline `4c46ca276…`. That baseline, rebuilt from a clean
   `git archive` of the same SHA and served independently, does not import a
   single GeoPDF on this machine — on the **same Chrome major version** the
   receipt names. Recorded as an **open question, not a refutation**. Two
   readings remain live: a machine- or profile-dependent factor not captured
   here, or a recorded matrix that is not reproducible as written. Repo SHA is
   excluded either way. A recorded pass that cannot be reproduced at its own
   baseline should not be carried forward silently.
2. **`byte_enc.pdf`.** The fixture manifest documents this 2,605 B file as
   `password-protected` and the fixtures README describes "a typed
   unlock/export error with no password UI". That is not what was observed:
   across a 180 s settle window and a dedicated bounded re-run (28 samples over
   420 s), the surface stayed on `Reading "byte_enc.pdf"…` with no outcome, no
   error row, and no record. Recorded **OPEN** — not a pass and not a fail — and
   **distinct from the Chrome hang**, which occurs in a different browser on
   every file. The harness's own `ERROR_NO_RECORD` label for this fixture is too
   coarse and is corrected in prose rather than silently in the JSON: *still
   reading* is not *a typed error*.

### Documentation defect found — the fixture manifest, not the product

`web/src/test/fixtures/geopdf/README.md` calls `manifest.json` "authoritative
for exact expected statuses". Measured against the running product, **6 of 13
`expected` values are inaccurate** — five files marked `manual-unsupported`
actually place from embedded coordinates, and `adobe_style_geospatial.pdf`
marked `manual-ambiguous` actually returns `selection-required`.

In every case the observed behaviour is what the parser unit tests already
assert, so **this is a documentation defect, not a product defect**. No test
catches it because `testFixtures.test.ts` asserts the manifest **against
itself**, which stays green regardless of product behaviour; the `expected`
column has no behavioural oracle behind it. **Recommended, not actioned:** no
fixture, manifest, or test is changed here. A future change should either
correct the six values or bind them to real behaviour — correcting them without
an oracle would only move the drift.

### `GEO_PDF_APPROVED_RULES`

Confirmed **empty** at `a75fef33c`. No producer-specific automatic main-map rule
is approved and **none is recommended**. The receipt's existing holdout finding
stands: `pdf-lib` returns a null Producer for all 12 holdout files and ArcSOC
appears in `Creator` instead, so producer-keyed signatures cannot match.
Re-keying to `Creator` would define a **new** selector and would require a
freshly frozen holdout, larger than the discovery set and drawn from quadrangles
not used here. A silent "first" or "largest" selection would be a defect.

## Artifact and publication boundary

- The complete desktop matrix came from a clean archive of `nightly` at
  `4c46ca276982ac9e4da593ee79b5a88503818511`.
- The renderer correction was tested from a clean archive at
  `fea8681385bf5ab2d62cc8e82f28839de1ca3a71`.
- PR #186 merged the correction and receipts into `nightly` at
  `7656364a6c16791a6334d0c8179e1c6c4cd01248`. A clean archive of that SHA
  passed all local gates and supplied the fresh physical evidence below.
- PR #188 merged the finite PDF.js image-area budget, responsive user-map-row
  correction, and candidate receipt into `nightly` at
  `cfabf37bf3b8314c8b073533951e2ee7c88aa601`. That exact SHA passed fresh full
  local gates, while its complete desktop and physical matrices remain unrun.
- Desktop preview origin:
  `http://127.0.0.1:4179/`.
- Integrated physical-iPhone preview origin:
  `http://192.168.1.161:4184/`.
- Chrome's normal acceptance surface was 1440×817 CSS pixels at DPR 2. The
  dedicated responsive case was exactly 320×640 CSS pixels.
- Firefox and Safari evidence captures were 1179×768 and 1081×768 pixels,
  respectively. Their control paths did not expose a separate CSS-viewport
  ledger, so no different viewport is inferred.
- Physical Mobile Safari ran on an iPhone 12 Pro with a 390×844-point screen.
  The Maine attempt began at 100% page zoom; the completed legacy New Hampshire
  run used 85% page zoom so the non-licence continuation remained operable.
- The complete baseline desktop matrix does not transfer to `fea868138…` or
  `7656364a…`. The integrated SHA owns its exact build gates and fresh physical
  legacy/Maine results, not an unrun complete post-fix desktop diagnostic
  matrix.
- No deployment or promotion to `weekly` or `main` was performed.

## Baseline Chrome 150

Chrome completed the full five-file real-USGS matrix on baseline
`4c46ca276…` through actual browser file-chooser uploads:

- Maine Isles of Shoals `/Measure`: all three frames;
- legacy New Hampshire Isles of Shoals `/LGIDict`: all three frames;
- San Francisco South `/Measure`: all three frames;
- Hampton 35 MB `/Measure`: all three frames; and
- Montara Mountain `/LGIDict`: all four frames.

Every initial multi-registration chooser had no selected radio. Every explicit
main-map and inset choice used four embedded points and reported `chosen by
you`; no case silently selected the first or largest frame and no supported
frame requested manual GCP entry. Adjust Points reported:

| File | Frame RMS values |
| --- | --- |
| ME Measure | Map Layers 9 m; Quadrangle 0 m; Adjoining 0 m |
| NH legacy LGIDict | Map Layers 5 m; Quadrangle 0 m; UTM 7 m |
| San Francisco Measure | Map Layers 8 m; Quadrangle 0 m; Adjoining 0 m |
| Hampton Measure | Map Layers 10 m; Quadrangle 0 m; Adjoining 0 m |
| Montara LGIDict | Map Layers 5 m; Quadrangle 0 m; Adjoining 0 m; UTM 6 m |

The final selection for every real file survived reload with page, label,
registration family, and `chosen by you` provenance. The same exact build also
passed:

- deterministic sole `/Measure` placement;
- deterministic sole `/LGIDict` placement;
- `GeoPDF page 1 of 2` reporting for the two-page control;
- `absent registration · manual points` for the plain-PDF control;
- the original long Hampton filename at 320×640, with no horizontal overflow
  and all controls scrollable and operable; and
- selected extent, clipping, source attribution, and provenance inspection.

Chrome returned no warning or error console entries after the matrix. Rendered
`src` and `href` values contained no imported filename, `file:` URL, or
temporary path. Three normal and three 35 MB import/remove cycles were
completed; confirmation-dialog delivery was noisy, but the product removals
were later observed.

The available high-level Chrome surface did not expose Network, Performance, or
Memory panels. It therefore did not prove import request bodies, long tasks,
input latency, retained documents, worker termination, object/blob URL
revocation, canvas release, or memory reclamation. The mission's 200 ms
long-task threshold was not measured, so no performance pass is claimed.

### Candidate IDs

- Maine:
  `measure-direct-0-21.1857165-0-3329.6884034-4020.0951565`,
  `measure-direct-1-2185.6597333-3720.3094069-163.8361943-117.583821`,
  `measure-direct-2-2172.5952-3898.2740941-93.2171525-127.1176337`.
- Legacy New Hampshire:
  `lgidict-direct-0-2103.0705723-3612.4027586-163.9554071-117.6496552`,
  `lgidict-direct-1-410.6593103-338.9636426-2391.9006897-3245.1844389`,
  `lgidict-direct-2-248.2317241-176.5361882-2716.7558621-3570.0393477`.
- San Francisco:
  `measure-direct-0-0-0-3389.7145968-3984.7847136`,
  `measure-direct-1-2185.6597333-3720.3094069-163.8361943-117.583821`,
  `measure-direct-2-2168.7111602-3898.2740941-100.9852322-127.1176337`.
- Hampton:
  `measure-direct-0-12.7114299-0-3346.6369766-4027.1572451`,
  `measure-direct-1-2185.6597333-3720.3094069-163.8361943-117.583821`,
  `measure-direct-2-2172.5952-3898.2740941-93.2171525-127.1176337`.
- Montara:
  `lgidict-direct-0-2147.0896552-3608.6780362-163.9724138-117.6618587`,
  `lgidict-direct-1-313.5604591-338.9572414-2586.120461-3241.4675862`,
  `lgidict-direct-2-2126.6758621-3760.5737931-204.8-204.8`,
  `lgidict-direct-3-151.132816-176.5296552-2910.9757472-3566.3227586`.

## Firefox 146.0.1

Firefox completed the same baseline rendered matrix: all five real files,
every main map and inset, no initial preselection, embedded Adjust Points,
selection/provenance persistence, sole Measure and LGIDict placement,
page-count reporting, plain-PDF fallback, and the 35 MB stress case.

Firefox Developer Tools showed no console rows with Errors, Warnings, Info, and
Logs enabled. Its Network panel showed no requests during observed removals.
Docking DevTools prevented the native file chooser from opening, so import-time
request bodies were not captured and no local-only network pass is claimed from
the removal-only ledger.

A Firefox heap snapshot after the monitored imports was 17.33 MB. After
removing Hampton, San Francisco, and a duplicate legacy New Hampshire record
and waiting five seconds, the next snapshot was 16.26 MB. The 1.07 MB decrease
is supporting cleanup evidence only: there was no pre-import baseline or
retained-object ledger, so resource release remains unproven.

## Desktop Safari 27.0

Desktop Safari completed the same baseline rendered matrix, including all
five files, every frame, no initial preselection, embedded Adjust Points,
selection/provenance persistence, sole Measure and LGIDict placement,
page-count reporting, plain-PDF fallback, controls, and the 35 MB stress case.

SafariDriver could not create a session because Safari's **Allow remote
automation** setting was disabled. JavaScript from Apple Events was also
disabled, and the supported accessibility path did not expose Web Inspector.
Those safe attempts did not yield console, request-body, long-task, or
retained-resource diagnostics. The rendered matrix passes; the diagnostic
matrix is precisely blocked.

## Physical Mobile Safari

The physical device was genuinely available:

- iPhone 12 Pro;
- iOS 27.0 beta, build `24A5390f`;
- paired, trusted, booted, connected, and available through `devicectl`;
- Developer Mode enabled; and
- controlled through iPhone Mirroring, not a simulator or responsive mode.

Two public USGS files were transferred locally with AirDrop and selected through
the native iOS Files chooser on the baseline run:

1. Maine `/Measure`, 5,831,077 bytes. Mobile Safari displayed
   `Reading "ME_Isles_of_Shoals_20240805_TM_geo.pdf"…` for more than 45 seconds,
   then returned to the startup Province-data licence dialog without an
   explicit reload. After continuing without Province layers, no imported
   record existed. This is consistent with a WebContent/page-process reload,
   but no physical Safari inspector or process log was available to prove that
   cause.
2. Legacy New Hampshire `/LGIDict`, 3,241,291 bytes. The chooser completed in
   about 30 seconds with all three registrations visible and no initial
   selection. `Map Layers` was selected explicitly, the preview outline changed,
   the record reported `GeoPDF page 1 · Map Layers · LGIDict · chosen by you`,
   and Adjust Points exposed embedded point data. After reload, the record
   remained enabled with the same selected label and provenance.

After PR #186 merged, exact `nightly` `7656364a…` was served from a clean archive
to a fresh Private-tab origin with no existing GeoPDF record:

1. Legacy New Hampshire `/LGIDict`, 3,241,291 bytes:
   - the native Files chooser import completed;
   - all three registrations appeared with no initial radio selection;
   - `Map Layers` was selected explicitly and its preview outline changed;
   - disabling OpenStreetMap left the warped USGS sheet visibly rendered,
     providing conclusive initial-render proof;
   - after reload and safe continuation without Province layers, the record
     remained enabled with page 1, `Map Layers`, `LGIDict`, and
     `chosen by you` provenance; but
   - the raster remained blank after waiting, isolating from the base map,
     disabling/re-enabling the record, and panning the map.
2. Maine `/Measure`, 5,831,077 bytes:
   - selecting the file returned Mobile Safari immediately to the startup
     licence dialog; and
   - after safe continuation, only the existing legacy record remained, proving
     that no Maine record was created.

The earlier 1158×1698/alpha-255 instrumented measurement remains supporting
diagnostic evidence, but the integrated clean run now independently proves both
the initial render pass and the post-reload render failure.

The earlier safely actionable physical run is complete, but candidate
`ae7d57009…` still requires exact physical Mobile Safari verification when the
device becomes available again.

## Independent holdout result

Twelve authoritative USGS files with distinct hashes were acquired locally
across six quadrangles. Exact URLs, bytes, hashes, metadata, licence evidence,
and oracle results are in
`2026-07-28-geopdf-frame-selection-corpus.json`.

The automatic rule remains rejected:

- `pdf-lib` returned a null/undefined PDF `Producer` for all discovery and
  holdout files.
- ArcSOC appears in PDF `Creator` instead:
  `ESRI ArcSOC 10.0.2.3200` for legacy files and
  `Esri ArcSOC 10.8.1.14362` for current files.
- The application extractor reads `document.getProducer()`, so the proposed
  producer-keyed signatures cannot match these files.
- Multiple current Measure files exceeded the frozen 1 source-pixel / 5
  projected-metre gate, and unsupported-CRS cases remained. The corpus receipt
  records the per-file values rather than normalizing those failures.

Changing the rule key from Producer to Creator would define a new selector and
would require a newly frozen, independent holdout evaluation. It is not
silently approved here.

## Durable evidence

Fifty-seven screenshots are retained under
`docs/research/geopdf-browser-evidence/`. They include:

- Chrome chooser, selected extents, final insets, 35 MB stress, and 320×640;
- Firefox and desktop Safari first/final frames, stress cases, and controls;
- physical chooser-unselected, explicit main-map selection, embedded-point
  inspector, persisted provenance, the 5.8 MB reading/reload sequence,
  diagnostic supporting evidence, correction-SHA enabled/disabled states, and
  the integrated fresh import/render/reload/Maine matrix.

The screenshots contain no PDF bytes. All external PDFs remain local and
untracked.

The 2026-07-30/31 branch evidence is retained separately under
`docs/research/acceptance-evidence/`, organized by date and case: the settled
stop rule 1 discrimination, the 16/16 chooser matrix, the 13-fixture control
matrix, the >10 MB native-input imports, the 320×640 responsive ledger and
import/remove cycles, the Chrome import-hang worker trace, the Safari
session-creation diagnostics, and the Vitest `NODE_ENV` diagnosis. Screenshots
there are JPEG at 1440 px to match the convention above. **No corpus PDF is in
any of it** — the five real USGS files are staged outside every git repository
and none was committed.

## Verification

The exact correction archive passed:

- `npm ci` — 329 packages, zero vulnerabilities;
- all 11 Node script tests;
- 1,011 Vitest tests passed with one skipped;
- `npm run lint`;
- `npm run build`; and
- `npm run check:pdf-assets` — 200 assets checked.

Branch and hosted-CI results belong to the later publication record and do not
replace this exact-runtime proof. After the final receipt edits, the task branch
also passed `npm ci` (329 packages, zero vulnerabilities), all 12 Node script
tests, 1,013 Vitest tests with one skipped, `npm run lint`, `npm run build`, and
`npm run check:pdf-assets` (200 assets). The build retained its existing
large-chunk advisory; it emitted no error.

PR #186 passed hosted change classification, web tests/build, and build-gate
checks before merging. A clean archive of integrated `nightly` `7656364a…`
then passed `npm ci` (329 packages, zero vulnerabilities), 12 Node script tests,
1,013 Vitest tests with one skipped, lint, build, and the 200-asset PDF.js check.

Candidate `ae7d57009…` passed `npm ci` (329 packages, zero vulnerabilities),
12 Node script tests, 1,015 Vitest tests with one skipped, `npm run lint`,
`npm run build`, and `npm run check:pdf-assets` (200 assets). The build retained
only the existing large-chunk advisory.

PR #188 then passed all hosted web checks and merged as `cfabf37bf…`. A fresh
exact-merge run passed `npm ci` (329 packages, zero vulnerabilities), 12 Node
script tests, 1,015 Vitest tests with one skipped, `npm run lint`,
`npm run build`, and `npm run check:pdf-assets` (200 assets). Hosted CI, merge,
exact local gates, browser matrices, deployment, and promotion remain separate
claims.

## Unresolved stop rules

The integrated artifact remains blocked because:

- the physical iPhone is unavailable, so the candidate Maine import and legacy
  import/render/reload cases have not run;
- the complete exact merged-SHA Chrome, Firefox, and desktop Safari matrices
  remain pending;
- Chrome did not expose required long-task, request-body, or retained-resource
  diagnostics;
- desktop Safari did not expose console, network, or resource diagnostics;
- Firefox import-time request bodies and retained-object release remain
  unproven; and
- current Measure holdouts exceed the frozen spatial threshold, while the
  proposed producer-keyed signatures do not match the files' actual metadata
  fields.

Updated 2026-07-31 — these stop rules moved:

- **Stop rule 1 is settled** as `PERSISTED_BUT_OFFSCREEN` on desktop Firefox
  across all five files. The physical Mobile Safari case still needs its own
  run; the desktop mechanism is a strong candidate explanation, not a closure.
- **Chrome and Chromium are `BLOCKED` by an import hang** that reproduces at
  this receipt's own baseline SHA and Chrome major version, isolated to PDF.js
  rasterization after `StartRenderPage`/`obj`. This supersedes "the Mac is
  locked" as the reason the Chrome matrix has not rerun.
- **Desktop Safari is `BLOCKED` at session creation**, with both documented
  remedies applied and neither effective. Zero cases run.
- **The 200 ms long-task diagnostic stays OPEN.** Firefox has no instrument,
  Chromium is blocked, and Safari is unmeasured. No lane can currently satisfy
  it.

And these questions are newly open:

- the **receipt-integrity question** — a recorded Chrome matrix that does not
  reproduce at its own baseline on the same major version;
- **`byte_enc.pdf`**, which produced no documented error across 28 samples over
  420 s, recorded OPEN and distinct from the Chrome hang; and
- the **fixture manifest**, inaccurate in 6 of 13 `expected` values while its
  README calls it authoritative and its test asserts it against itself. A
  documentation defect, not a product defect.

The machine-readable companion receipt is
`docs/research/2026-07-28-geopdf-browser-acceptance.json`. The 2026-07-30/31
branch evidence is under `docs/research/acceptance-evidence/`.
