# Web print/export acceptance ledger — 2026-07-23

## Scope and evidence boundary

This ledger validates the web map's monochrome US Letter research packet and
field sheet. Committed evidence must use only public or synthetic parcel
fixtures. Do not record a tester's address, browser-location coordinates,
private notes, device identifiers, or other personal data.

Automated checks, desktop browser rendering, saved-PDF inspection, iPhone
AirPrint preview, physical monochrome printing, hosted CI, merge, and deployment
are separate proof layers. A pass in one layer does not establish another.

## Acceptance ledger

| ID | Surface | Fixture | Expected | Result | Evidence |
|---|---|---|---|---|---|
| PRINT-01 | Chrome macOS | Research, appendix on | Letter portrait; no clipping | Pass | Chrome native print reported 6 pages. The saved PDF is 6 portrait Letter pages (`612 × 792 pt`); all pages contain selectable text, and a six-page raster contact sheet showed no blank, clipped, or overlapping page. Page 1 retained the monochrome hatch, 9 pt content, complete attribution, limitations, written URL, and QR. |
| PRINT-02 | Safari macOS | Research, appendix off | One portrait page | Blocked | Safari loaded the local build and public fixture, but its fresh local origin stopped at the Province restricted-services licence acknowledgement. The acknowledgement was not accepted without action-time user confirmation, so Safari native pagination remains unproved. |
| PRINT-03 | Chrome macOS | Field map | One landscape page; complete bounds | Pass | Chrome native print reported 1 page. The saved PDF has a true landscape Letter MediaBox (`792 × 612 pt`), the frozen regional bounds, named below-zoom omissions, separated attribution/limitations/receipt rows, and no clipping. |
| PRINT-04 | Safari iPhone | AirPrint preview | Correct orientation and readable controls | Blocked | iPhone Mirroring reported that the paired phone was not found and required the phone to be nearby, powered on, recently unlocked, with Bluetooth and Wi-Fi enabled. No AirPrint inference was made from desktop printing. |
| PRINT-05 | Saved PDF | Research + field | Reopens; links clickable; QR matches URL | Pass | Chrome-saved research and field PDFs reopened and rasterized successfully. The research packet contains 83 URL annotations; the field sheet contains 6. Apple Vision decoded each printed QR to the same exact public-fixture map-state URL written in that document's receipt. |
| PRINT-06 | Monochrome printer | Research + field | Hatch, lines, 9 pt text, attribution readable | Pending human inspection | The research summary page and field sheet were submitted one-sided in grayscale/Letter mode as Brother jobs `1083` and `1084`; both jobs completed and the printer returned to idle. Submission is not legibility proof: a human still needs to inspect hatch, line contrast, 9 pt text, attribution, and QR on the two physical sheets. |
| PRINT-07 | Failed evidence source | Research | Unavailable, not empty | Pass | Mocked acceptance harness passed: `PrintPreview.test.tsx` times out pending research as “Source unavailable at export time”; `PrintDocuments.test.tsx` preserves empty, outside-coverage, and source-error wording separately. |
| PRINT-08 | Failed map layer | Both | Warning, retry, deliberate incomplete print | Pass | Mocked acceptance harness passed: `PrintPreview.test.tsx` requires an explicit incomplete-map decision, retains the warning, limits receipt layers to those rendered, and proves Retry creates a fresh attempt that ignores stale callbacks and can settle successfully; `PrintDocuments.test.tsx` names the failed layer. |
| PRINT-09 | Privacy | Browser location enabled before preview | No location marker or coordinates in output | Blocked | Chrome's one-time permission was selected for the local origin without recording coordinates, but the page immediately reported that location permission was not granted, consistent with an external macOS Location Services block. Automated tests still pass location-marker exclusion and printable-viewport suppression; an actual enabled-location output remains unproved. |

## Fixture notes

- Use a public tax-sale PID already present in the checked-in owner-free
  municipal notice fixtures, or a synthetic PID in the mocked acceptance
  harness.
- Enable representative property, roads, water, contour, and open-data layers
  where the fixture and current zoom permit them.
- Never commit the operator's browser-location coordinates or substitute a
  nearby address for a selected parcel.

## Automated gate log

Run from a clean dependency install in `web/` on 2026-07-23:

| Command | Result | Receipt |
|---|---|---|
| `npm ci` | Pass | 285 packages installed; 286 audited; 0 vulnerabilities. |
| `npm test` | Pass | After rebasing onto the PVSC dwelling-evidence change, 37 test files passed and 1 intentional live-service file skipped; 333 tests passed, 1 skipped. The merged print contract now includes race-safe dwelling evidence in research readiness, timeout handling, summary status, appendix output, and PVSC attribution. |
| `npm run lint` | Pass | ESLint completed with no errors or warnings after three stale, unused type imports from the upstream `ParcelInspector` extraction were removed from `App.tsx`. |
| `npm run build` | Pass | TypeScript and Vite production build completed. Vite retained its existing advisory for chunks over 500 kB; it was not a build failure. |
| `git diff --check` | Pass | No whitespace errors. |

The complete gate sequence was rerun after the import cleanup. The results above
are from that clean rerun.

### 2026-07-24 conflict-resolution and acceptance rerun

| Command | Result | Receipt |
|---|---|---|
| `npm test` | Pass | 40 test files passed and 1 intentional live-service file skipped; 415 tests passed and 1 skipped. |
| `npm run lint` | Pass | ESLint completed with no errors or warnings. |
| `npm run build` | Pass | TypeScript and Vite completed. Vite retained the existing advisory for chunks over 500 kB; it was not a build failure. |
| `git diff --check` | Pass | No whitespace errors. |

## Manual gate notes

### Chrome native preview and saved PDFs

Chrome opened the local development build with owner-free public fixture PID
`50203256`. The acceptance rerun found and fixed three renderer-level defects:

- named `@page` rules caused a phantom extra Chrome page, so the active preview
  now emits one unnamed portrait or landscape `@page` rule;
- the QR receipt is now an atomic data-URL image rather than a nested inline
  SVG; and
- upstream evidence/source additions overflowed rigid page rows, so the
  research source list now flows inline and both templates reserve measured
  non-overlapping space for attribution, limitations, and receipts.

The final research packet is 6 nonblank portrait Letter pages. The final field
sheet is 1 landscape Letter page. Raster inspection showed the selected-parcel
hatch, map, receipt status, active-layer legend, source/licence material,
limitations, written URL, and QR without collision or clipping. The field sheet
retained the frozen regional extent and explicitly named property boundaries,
water, and roads as not rendered at its print scale.

The final saved artifacts were inspected outside the browser with `pdfinfo`,
`pdftotext`, `pdfinfo -url`, Poppler rasterization, and Apple Vision barcode
detection. The PDFs are temporary acceptance artifacts and are not committed.

### Remaining proof boundaries

Safari macOS remains blocked at a legal acknowledgement, Safari iPhone remains
blocked by device availability, and actual browser-location output remains
blocked by macOS permission state. The two grayscale printer jobs completed,
but paper legibility remains pending human inspection. No hosted CI, merge,
deployment, production availability, AirPrint success, location success, or
physical-paper acceptance is claimed by this ledger.
