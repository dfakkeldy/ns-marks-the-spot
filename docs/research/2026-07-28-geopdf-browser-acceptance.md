# GeoPDF browser acceptance receipt — blocked

Date: 2026-07-28

Baseline runtime commit: `4c46ca276982ac9e4da593ee79b5a88503818511`

Correction runtime commit: `fea8681385bf5ab2d62cc8e82f28839de1ca3a71`

Decision: **BLOCKED**

The complete rendered matrix passes in Chrome 150, Firefox 146.0.1, and desktop
Safari 27.0 on the baseline SHA. A physical iPhone 12 Pro run also proves the
chooser, explicit legacy-frame selection, embedded-point inspection, and
provenance persistence.

The correction SHA replaces the unreliable iPhone `ImageBitmap`-only path with
a cancelable HTML-image fallback and bounds high-DPR canvas allocation to the
viewport. Its exact archive passed every local gate. A targeted physical rerun
on a behavior-matching instrumented branch restored a non-zero DPR-3 canvas at
an embedded GCP and measured opaque pixels. That probe is supporting evidence,
not an exact clean artifact. The exact archive reused a baseline-created
persisted record, and its ocean-coloured raster did not produce a conclusive
screenshot-only contrast.

The feature is still not fully browser-accepted: the 5.8 MB physical import
still returns to the startup licence dialog, the correction SHA has not
completed the full five-file desktop matrix, and required browser diagnostics
remain unavailable. No runtime selector or parser change is justified. Every
multi-frame GeoPDF still requires an explicit user choice.

## Artifact and publication boundary

- The complete desktop matrix came from a clean archive of `nightly` at
  `4c46ca276982ac9e4da593ee79b5a88503818511`.
- The renderer correction was tested from a clean archive at
  `fea8681385bf5ab2d62cc8e82f28839de1ca3a71`.
- Desktop preview origin:
  `http://127.0.0.1:4179/`.
- Physical-iPhone preview origin:
  `http://192.168.1.161:4179/`.
- Chrome's normal acceptance surface was 1440×817 CSS pixels at DPR 2. The
  dedicated responsive case was exactly 320×640 CSS pixels.
- Firefox and Safari evidence captures were 1179×768 and 1081×768 pixels,
  respectively. Their control paths did not expose a separate CSS-viewport
  ledger, so no different viewport is inferred.
- Physical Mobile Safari ran on an iPhone 12 Pro with a 390×844-point screen.
  The Maine attempt began at 100% page zoom; the completed legacy New Hampshire
  run used 85% page zoom so the non-licence continuation remained operable.
- The complete baseline matrix does not transfer to `fea868138…`. That SHA owns
  only its exact build gates, automated regressions, and targeted physical
  reruns.
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

The correction SHA was then run from an exact clean archive on the same physical
device. It reused the record created by the baseline run; therefore its retained
page, label, LGIDict family, enabled state, and `chosen by you` provenance are
state evidence only, not fresh-import proof. At an embedded-GCP focus, a
temporary diagnostic build reported a 1158×1698 DPR-3 canvas and centre alpha
255, directly exercising the corrected HTML-image and viewport-bounded path.
That instrumentation was removed before the exact archive was rebuilt. The
clean artifact completed enable, reload, disable, and re-enable state checks,
and its screenshots are retained. Because this sheet area is almost the same
blue as the empty ocean map, the clean screenshots are not overstated as
independently conclusive render proof.

The 5.8 MB Maine `/Measure` import was repeated on a behavior-matching corrected
branch. After about 30 seconds Mobile Safari again returned to the startup
licence dialog and the record was absent. It was not repeated from the exact
correction archive, so the exact-artifact case remains unrun.

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

Fifty screenshots are retained under
`docs/research/geopdf-browser-evidence/`. They include:

- Chrome chooser, selected extents, final insets, 35 MB stress, and 320×640;
- Firefox and desktop Safari first/final frames, stress cases, and controls;
- physical chooser-unselected, explicit main-map selection, embedded-point
  inspector, persisted provenance, the 5.8 MB reading/reload sequence,
  diagnostic supporting evidence, and correction-SHA enabled/disabled states.

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

## Unresolved stop rules

The decision remains blocked because:

- physical Mobile Safari did not complete the 5.8 MB Maine import on a
  behavior-matching correction branch, while the exact correction case remains
  unrun;
- the exact correction archive reused a baseline-created legacy record, so its
  fresh chooser-to-reload physical sequence remains unrun;
- the correction SHA has targeted physical evidence but not a complete
  post-fix five-file browser matrix;
- the exact clean physical screenshots do not independently establish visual
  contrast for the ocean-coloured raster; the opaque-canvas diagnostic is
  supporting evidence only;
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
