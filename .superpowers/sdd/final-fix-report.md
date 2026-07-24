# Final review fix report

Date: 2026-07-23

Review base: `de71886dc3c8d470d06b751568df5b2c43c4b4b4`

Reviewed head: `93e5823163a9f83a06d9d4fb7354f596cfda8aec`

Implementation commit:
`fa7140f9dd423a47a56de0c2844cdfd105014d7d`

Source findings: `.superpowers/sdd/final-review-findings.md`

## Status

All Critical, Important, and Minor findings in the final whole-branch review
are implemented with focused regression coverage.

No branch was pushed and no pull request was opened.

## Fix receipt

| Finding | Implemented outcome | Focused evidence |
|---|---|---|
| Mandatory restricted-source attribution | Required NSPRD selected-geometry attribution is independent from rendered layer IDs and carries the Province acknowledgement, restricted licence, source link/date, and not-a-survey limitation. Research evidence dependencies now retain buildings, roads, water, published river, coastal, civic, PVSC, and resource sources even when a source is unavailable. Field output also retains mandatory selected-geometry acknowledgement and licence material. | `PrintDocuments.test.tsx` covers empty rendered IDs, below-scale NSPRD, failed evidence, and source/licence links. |
| Lossless appendix provenance | The appendix now preserves selected event order, status, facts, official links, event limitations, mapped area in square metres and acres, building point/polygon counts, assessment match method and records, civic record IDs, road/water relationships, flood results, resource results, source/retrieval dates, capture timestamp, named authority, source-specific limitation, acknowledgement, source URL, and licence URL. Failure states keep named provenance and do not become empty results. | `PrintDocuments.test.tsx` covers event facts/sources/limits, mapped area, spatial matching, dated PVSC provenance, failure provenance, and exact capture time. |
| Independent river and coastal evidence | Published-river and coastal subsections render independently for outside-extent, within-extent/no-hit, intersection, and error states. Coastal no-intersection and intersection output retain scenario metrics without turning a no-hit into proof of no hazard. | Parameterized mixed-state cases in `PrintDocuments.test.tsx`. |
| Sticky, aggregated tile readiness | Physical ArcGIS tile sublayers are tracked independently. A logical layer becomes ready only after every physical sublayer succeeds, and any current-attempt error remains sticky. `PrintMap` also rejects a late ready callback after an error. | `MapCanvas.test.tsx` covers both roads passes and error-followed-by-load; `PrintMap.test.tsx` covers logical sticky error. |
| Bounded map attempts | Each print-map attempt has a 15-second timeout. Unresolved layer IDs are named in the alert, remain sticky for that attempt, and expose Retry plus deliberate incomplete-print consent. A retry creates a fresh attempt while stale callbacks remain excluded. | `PrintPreview.test.tsx` covers unresolved Roads timeout, retry, incomplete consent, and stale-attempt isolation. |
| Display-only, semantically monochrome cartography | Print maps omit Leaflet scale and coordinate-copy controls, block identify/location and feature/overview-marker handlers, use explicit grayscale/pattern/dash distinctions for parcel, current/historical overview, resource, mineral-proximity, and seven hydro classes, and include matching legend samples plus a north indicator. | `MapCanvas.test.tsx`, `MineralProximityParcelLayer.test.tsx`, and `PrintDocuments.test.tsx`. |
| Field legal boundary | The field sheet now states: “Field screening/reference material only. Not a survey or an access conclusion.” | `PrintDocuments.test.tsx`. |
| Template-specific controls | Appendix inclusion is disabled in Field with an applicability note. Aerial inclusion is disabled when aerial imagery was absent from the frozen capture. | `PrintPreview.test.tsx`. |

## TDD receipt

The focused regression wave was added before the corresponding production
fixes and run in RED:

```text
Test files: 5
Expected failing tests: 18
Areas: attribution/provenance, independent flood output, sticky/aggregated
readiness, map timeout, display-only monochrome symbols, field warning, and
template-specific controls
```

After implementation, the same focused command passed:

```text
Test files: 5 passed
Tests: 72 passed
```

## Final automated gates

Run from `web/` after a clean dependency install:

| Command | Result |
|---|---|
| `npm ci` | Pass — 285 packages installed, 286 audited, 0 vulnerabilities |
| `npm test` | Pass — 36 files passed, 1 intentional live-service file skipped; 316 tests passed, 1 skipped |
| `npm run lint` | Pass — no errors or warnings |
| `npm run build` | Pass — TypeScript and Vite production build completed |
| `git diff --check` | Pass — no whitespace errors |

Vite continues to emit its existing advisory for chunks larger than 500 kB.
It is an advisory, not a build failure, and this fix wave did not convert it
into a new acceptance claim.

## Proof boundary and remaining manual gates

The automated results establish code behavior and buildability only. They do
not establish native print pagination, margins, clipping, saved-PDF behavior,
Safari rendering, iPhone AirPrint behavior, QR scanning, physical monochrome
legibility, or actual browser-geolocation acceptance.

The following remain pending in
`docs/real-world-testing/2026-07-23-web-print-export-test-plan.md`:

- Chrome and Safari native print pagination and clipping;
- Safari macOS output;
- Safari iPhone AirPrint preview;
- saved and reopened PDF links plus QR scanning;
- physical monochrome output and 9 pt readability; and
- actual browser-geolocation permission and privacy acceptance.

No hosted-CI, merge, deployment, or production-availability claim is made.

## Final re-review fix pass

Source findings: `.superpowers/sdd/final-rereview-findings.md`

Implementation commit:
`c301cd76413c1fa0322d188e47d1ab7a316ea826`

| Re-review item | Implemented outcome | Focused evidence |
|---|---|---|
| Important — restore interactive ArcGIS recovery | Interactive province and resource tile layers now recover from an earlier tile error after a later successful load. Print-mode physical sublayer errors remain sticky and aggregated, so one failed print sublayer cannot be overwritten by a late load. | `MapCanvas.test.tsx` covers recovery for the two-sublayer Roads layer and the single-sublayer Mineral Tenure resource; the existing print-mode Roads regression continues to cover sticky aggregation. |
| Important — use actual monochrome legend samples | Every printable rendered-layer category now has an explicit, distinct monochrome treatment tied to a semantic `data-symbol-kind`. Samples represent basemap grid/tone, parcel and study boundaries, points, lines/corridors, building footprints, hatches, hydro classes, river bands, and the three coastal scenarios. Current/historical tax-sale, selected parcel, mineral-proximity, and hydro treatments remain preserved. | `PrintDocuments.test.tsx` requires a unique semantic kind for every printable layer and checks representative layer meanings. `styles.test.ts` requires an explicit, distinct CSS treatment for every layer ID. |
| Important — bound empty building evidence | A valid zero result now says “No mapped building feature returned.” A nonzero result retains exact total, point, and polygon counts with correct singular/plural wording. Pending and error states remain unavailable rather than empty. | `PrintDocuments.test.tsx` covers exact zero and nonzero wording. |
| Minor — refresh the automated ledger | The automated ledger now records the final 322-pass receipt, explicitly marks the 303-test receipt as pre-fix, and retains the reviewed 316-test intermediate receipt. | `docs/real-world-testing/2026-07-23-web-print-export-test-plan.md`; no pending manual row was changed. |

### Re-review TDD receipt

The first focused RED run reported five expected failures with 60 passing
tests. A dedicated RED run then confirmed the single-sublayer interactive
resource recovery regression. After the production changes, the complete
focused set passed:

```text
Test files: 3 passed
Tests: 66 passed
```

### Re-review final automated gates

Run from `web/` on the exact implementation committed above:

| Command | Result |
|---|---|
| `npm test` | Pass — 36 files passed, 1 intentional live-service file skipped; 322 tests passed, 1 skipped |
| `npm run lint` | Pass — no errors or warnings |
| `npm run build` | Pass — TypeScript and Vite production build completed |
| `git diff --check` | Pass — no whitespace errors |

Vite retained its existing advisory for chunks larger than 500 kB. The
automated gates do not satisfy the pending pagination, Safari, saved-PDF, QR,
AirPrint, physical monochrome, or actual browser-geolocation checks. No pending
manual row was altered, and no hosted-CI, merge, deployment, or
production-availability claim is made.

## Final legend collision fix

Source finding: `.superpowers/sdd/final-rereview-findings.md` under
“Final legend collision”

Implementation commit:
`c145bef30ba2bb0d0efd3eb6078b7d0d1898e626`

The NSPRD legend sample now uses the same thin grey boundary and white
low-fill visual hierarchy as the ordinary print context parcel in
`parcelStyle.ts`. The selected parcel retains its heavier dominant hatch.
Selected, current-notice, historical-record, NSPRD, and every optional
rendered-layer category now carry distinct semantic legend coverage.

The focused tests were first run in RED and failed for the intended two
reasons: NSPRD still used the selected-like 1.5 pt hatch, and the core parcel
states lacked semantic legend identities. After the fix:

| Command | Result |
|---|---|
| `npm test -- src/components/print/PrintDocuments.test.tsx src/styles.test.ts` | Pass — 2 files, 31 tests |
| `npm test` | Pass — 36 files passed, 1 intentional live-service file skipped; 322 tests passed, 1 skipped |
| `npm run lint` | Pass — no errors or warnings |
| `npm run build` | Pass — TypeScript and Vite production build completed |
| `git diff --check` | Pass — no whitespace errors |

Vite retained its existing advisory for chunks larger than 500 kB. This
legend-only correction does not alter or satisfy any pending manual acceptance
row, and no hosted-CI, merge, deployment, or production-availability claim is
made.
