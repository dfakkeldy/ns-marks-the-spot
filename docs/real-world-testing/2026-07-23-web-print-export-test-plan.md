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
| PRINT-01 | Chrome macOS | Research, appendix on | Letter portrait; no clipping | Pending | Real Chrome screen preview rendered public PID `50203256` with parcel-complete map, monochrome hatch, appendix, 9 pt content, attribution, written URL, and local QR. Native print pagination, margins, and clipping were not inspected. |
| PRINT-02 | Safari macOS | Research, appendix off | One portrait page | Pending | Safari was not controlled in this run. |
| PRINT-03 | Chrome macOS | Field map | One landscape page; complete bounds | Pending | Real Chrome screen preview rendered the field sheet with the frozen regional extent and named below-zoom layer omissions. Native landscape print pagination and complete-bounds output were not inspected. |
| PRINT-04 | Safari iPhone | AirPrint preview | Correct orientation and readable controls | Pending | No iPhone/AirPrint session was available. |
| PRINT-05 | Saved PDF | Research + field | Reopens; links clickable; QR matches URL | Pending | Available Chrome DOM control could not operate the native print destination or produce and reopen saved PDFs. |
| PRINT-06 | Monochrome printer | Research + field | Hatch, lines, 9 pt text, attribution readable | Pending | No physical monochrome printer run was performed. |
| PRINT-07 | Failed evidence source | Research | Unavailable, not empty | Pass | Mocked acceptance harness passed: `PrintPreview.test.tsx` times out pending research as “Source unavailable at export time”; `PrintDocuments.test.tsx` preserves empty, outside-coverage, and source-error wording separately. |
| PRINT-08 | Failed map layer | Both | Warning, retry, deliberate incomplete print | Pass | Mocked acceptance harness passed: `PrintPreview.test.tsx` requires an explicit incomplete-map decision, retains the warning, limits receipt layers to those rendered, and proves Retry creates a fresh attempt that ignores stale callbacks and can settle successfully; `PrintDocuments.test.tsx` names the failed layer. |
| PRINT-09 | Privacy | Browser location enabled before preview | No location marker or coordinates in output | Pending | Automated harness passed location-marker exclusion and printable-viewport suppression, and the real public-PID previews showed no location UI. Actual browser geolocation permission was not enabled, so this row remains pending. |

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
| `npm test` | Pass | 36 test files passed, 1 intentional live-service file skipped; 303 tests passed, 1 skipped. |
| `npm run lint` | Pass | ESLint completed with no errors or warnings after three stale, unused type imports from the upstream `ParcelInspector` extraction were removed from `App.tsx`. |
| `npm run build` | Pass | TypeScript and Vite production build completed. Vite retained its existing advisory for chunks over 500 kB; it was not a build failure. |
| `git diff --check` | Pass | No whitespace errors. |

The complete gate sequence was rerun after the import cleanup. The results above
are from that clean rerun.

## Manual gate notes

### Chrome screen preview

Chrome opened the local development build with owner-free public fixture PID
`50203256`. The research preview with appendix enabled visibly rendered:

- the complete selected parcel at zoom 18 with a monochrome selected-parcel
  hatch;
- returned-zero buildings, one captured PVSC account, empty civic evidence,
  outside-study river wording, and returned resource evidence without
  collapsing those meanings;
- OpenStreetMap, restricted Province, Nova Scotia open-data, and PVSC
  attribution and licence links; and
- the exact written map-state URL and a locally rendered QR.

Switching the same frozen capture to the field template visibly rendered the
regional frozen extent at zoom 7, the current-notice parcels, the written
receipt and QR, and the explicit message that property boundaries, water, and
roads were not rendered at that print scale. The Chrome console contained no
warnings or errors during this preview run.

These observations establish real browser screen-preview rendering only. The
available Chrome control surface could not inspect the native print dialog,
save a PDF, reopen it in Preview, or prove printed page count, orientation,
margins, clipping, link behavior, or QR scanning. Safari macOS, Safari iPhone
AirPrint, actual browser-location permission, and physical monochrome output
were not run.

Because PRINT-01 through PRINT-06 and PRINT-09 remain pending, the corresponding
project-plan item remains unchecked. No hosted CI, merge, deployment, or
production availability is claimed by this ledger.
