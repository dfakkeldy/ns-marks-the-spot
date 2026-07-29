# GeoPDF browser acceptance receipt — blocked

Date: 2026-07-28

Baseline runtime commit: `4c46ca276982ac9e4da593ee79b5a88503818511`

Correction runtime commit: `fea8681385bf5ab2d62cc8e82f28839de1ca3a71`

Integrated `nightly` commit: `7656364a6c16791a6334d0c8179e1c6c4cd01248`

Decision: **BLOCKED**

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

The 5.8 MB Maine import on the exact merged artifact also returned immediately
to the startup licence dialog and created no record. The feature therefore
remains physically failed and has not completed the full post-fix desktop
diagnostic matrix. No runtime selector or parser change is justified. Every
multi-frame GeoPDF still requires an explicit user choice.

## Artifact and publication boundary

- The complete desktop matrix came from a clean archive of `nightly` at
  `4c46ca276982ac9e4da593ee79b5a88503818511`.
- The renderer correction was tested from a clean archive at
  `fea8681385bf5ab2d62cc8e82f28839de1ca3a71`.
- PR #186 merged the correction and receipts into `nightly` at
  `7656364a6c16791a6334d0c8179e1c6c4cd01248`. A clean archive of that SHA
  passed all local gates and supplied the fresh physical evidence below.
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

No further user action is required for this receipt: the physical device was
available and the safely actionable run was made.

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

## Unresolved stop rules

The decision remains blocked because:

- exact merged physical Mobile Safari does not repaint the enabled legacy
  raster after reload, despite persisting its record and provenance;
- exact merged physical Mobile Safari does not complete the 5.8 MB Maine import
  and creates no record;
- the correction has not completed a full post-fix five-file desktop rendered
  and diagnostic matrix;
- Chrome did not expose required long-task, request-body, or retained-resource
  diagnostics;
- desktop Safari did not expose console, network, or resource diagnostics;
- Firefox import-time request bodies and retained-object release remain
  unproven; and
- current Measure holdouts exceed the frozen spatial threshold, while the
  proposed producer-keyed signatures do not match the files' actual metadata
  fields.

The machine-readable companion receipt is
`docs/research/2026-07-28-geopdf-browser-acceptance.json`.
