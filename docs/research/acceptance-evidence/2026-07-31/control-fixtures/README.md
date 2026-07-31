# Control fixtures — page-count reporting and the manual-points boundary

Date: 2026-07-31
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Origin: `http://127.0.0.1:4340` — `vite preview` of this worktree's `dist`
Browser: **Firefox 152.0.6**, buildID `20260713164047`, geckodriver 0.37.1

## Harness — the Firefox lane. NOT the Chrome extension bridge.

| | Chrome lane (inherited, still BLOCKED) | Firefox lane (this file) |
| --- | --- | --- |
| Driver | Chrome extension bridge, Browser 1 | geckodriver 0.37.1 + Selenium 4.46.0 |
| Delivery | `file_upload` bridge / scripted `DataTransfer` | native `<input type=file>` `send_keys` |
| Profile | the user's live profile | fresh geckodriver temp profile |

**Firefox 152.0.6 is not the receipt's 146.0.1.** Every result here *extends*
the record and closes **no** Firefox line item the receipt left open. Nothing
here transfers to Chrome, where import is still BLOCKED.

Both harness guards added by the 2026-07-31 chooser matrix are carried
unchanged — `ff_controls.py` imports them from `ff_chooser.py` rather than
reimplementing them:

1. per-file IndexedDB + `user-map-ui-state-v1` reset;
2. an explicit `recordsBeforeImport == 0` assertion per fixture.

**All 13 fixtures recorded `recordsBeforeImport: 0`.** No reading below can be
describing an earlier file.

Fixtures are the repository's own tracked test data under
`web/src/test/fixtures/geopdf/`. **No corpus PDF is in this commit.**

## A. Page-count reporting — PASSES on this lane

Two separate two-page fixtures both report the page count in the import
outcome *and* in the persisted row, and both import page 1 only.

| Fixture | Pages | Outcome copy | Row copy |
| --- | ---: | --- | --- |
| `byte_and_rgbsmall_2pages.pdf` | 2 | `Page 1 of 2 imported; later pages were not imported.` | `GeoPDF page 1 of 2 · unsupported-crs registration · manual points` |
| `registration-page-2.pdf` | 2 | `Page 1 of 2 imported; later pages were not imported.` | `GeoPDF page 1 of 2 · absent registration · manual points` |

`pageCount: 2` persisted in IndexedDB for both. Single-page fixtures report
`GeoPDF page 1` with no "of N" suffix, so the suffix is not unconditional copy.

`registration-page-2.pdf` additionally proves the case it was built for: its
registration lives on page 2, and page 1 reports **`absent registration`**
rather than borrowing it. A later page's registration does not leak forward.

## B. The manual-points boundary — holds in BOTH directions

The rule: manual control points are reserved strictly for registration that is
missing, malformed, unreadable, or unsupported (including unsupported CRS).
Both directions were measured; neither was assumed.

### Direction 1 — no usable registration MUST fall back to manual, and say why

Silently placing any of these would be a defect. None did.

| Fixture | Reason persisted | Row copy | Control offered | Badge | Checkbox |
| --- | --- | --- | --- | --- | --- |
| `plain.pdf` | `absent` | `GeoPDF page 1 · absent registration · manual points` | `Georeference` | `Needs georeferencing` | disabled |
| `registration-page-2.pdf` | `absent` | `GeoPDF page 1 of 2 · absent registration · manual points` | `Georeference` | `Needs georeferencing` | disabled |
| `malformed-measure.pdf` | `invalid` | `GeoPDF page 1 · invalid registration · manual points` | `Georeference` | `Needs georeferencing` | disabled |
| `unsupported-crs.pdf` | `unsupported-crs` | `GeoPDF page 1 · unsupported-crs registration · manual points` | `Georeference` | `Needs georeferencing` | disabled |
| `byte_and_rgbsmall_2pages.pdf` | `unsupported-crs` | `GeoPDF page 1 of 2 · unsupported-crs registration · manual points` | `Georeference` | `Needs georeferencing` | disabled |

The receipt's exact `absent registration · manual points` string is reproduced
verbatim on this lane. Each reason is **distinct and truthful** — `absent`,
`invalid` and `unsupported-crs` are not collapsed into one generic state, which
is the `AGENTS.md` evidence rule that an empty or failed response is not
evidence of absence.

`corrupt.pdf` is the unreadable case and is correctly *not* a manual import:
it produces a typed error, `corrupt.pdf: This PDF could not be read. Export a
new copy and try again.`, and **no record at all**.

### The encrypted control did NOT produce a typed error — open, not a pass

`byte_enc.pdf` (2,605 B) is documented in the fixture manifest as
`password-protected`, described in the fixtures README as "a typed
unlock/export error with no password UI". That is **not** what this lane
observed. Through the full 180 s settle window the status surface stayed on
`Reading "byte_enc.pdf"…` with **no outcome, no error row, and no record**.

`control-matrix.json` scores this fixture `ERROR_NO_RECORD`, which is the
harness's own classifier being too coarse: it inferred "error" from the absence
of a record. **"Still reading" is not "a typed error."** That label is wrong and
is corrected here rather than in the JSON, so the discarded classification stays
visible.

A dedicated bounded re-run is recorded separately in
`encrypted-control.json` / `../control-fixtures-encrypted/`. Reported as an
open observation, **not as a pass and not as a fail**.

### Direction 2 — readable, supported registration must NEVER be pushed to manual

| Fixture | Selected label | Flavor | GCPs | Status | Control offered |
| --- | --- | --- | ---: | --- | --- |
| `ns-utm20-lgidict.pdf` | `NAD83 / UTM zone 20N` | LGIDict | 4 | `embedded` / `sole` | `Adjust points` |
| `ns-utm20-iso.pdf` | `Layer` | Measure | 4 | `embedded` / `sole` | `Adjust points` |
| `test_iso32000.pdf` | `Layer` | Measure | 4 | `embedded` / `sole` | `Adjust points` |
| `test_ogc_bp.pdf` | `WGS 84` | LGIDict | 4 | `embedded` / `sole` | `Adjust points` |
| `rotated-cropped.pdf` | `Map frame` | Measure | 4 | `embedded` / `sole` | `Adjust points` |

Every one placed from embedded coordinates with four points, reported
`sole registration`, and offered `Adjust points` — never `Georeference`. No
supported registration was pushed to manual.

### The ambiguous case goes to the chooser, not to manual

`adobe_style_geospatial.pdf` carries two registrations. It resolved to
`selection-required`: a **2-radio chooser, `anyChecked` false, `Use this frame`
disabled**, row reading `Choose frame`, outcome `Choose the main map or an
inset; its embedded coordinates will place it.`

That is the correct contract and is consistent with `GEO_PDF_APPROVED_RULES`
being empty — two or more candidates can only return `selection-required`.
No silent first-or-largest selection occurred.

**Boundary verdict: the product's four states are coherent and correctly
separated** — sole supported registration → embedded; two or more → chooser;
missing/invalid/unsupported-CRS → manual with a truthful distinct reason;
unreadable → typed error and no record.

## Documentation defect found — the fixture manifest, not the product

`web/src/test/fixtures/geopdf/README.md` states "The manifest is authoritative
for exact expected statuses." Measured against the running product, **6 of 13
`expected` values in `manifest.json` are inaccurate**:

| Fixture | `manifest.expected` | Observed | Corroborated by |
| --- | --- | --- | --- |
| `ns-utm20-lgidict.pdf` | `manual-unsupported` | `embedded` | `geoPdfMetadata.test.ts` asserts `rejected == []` and a sole `NAD83 / UTM zone 20N` candidate; EPSG:26920 is in `SUPPORTED_EPSG_CODES` |
| `ns-utm20-iso.pdf` | `manual-unsupported` | `embedded` | same test asserts a sole `Layer` Measure candidate with 4 GCPs |
| `test_iso32000.pdf` | `manual-unsupported` | `embedded` | same test asserts `gcps[0]` = pixel (0,0) → map lat 49, lng 2 |
| `test_ogc_bp.pdf` | `manual-unsupported` | `embedded` | same test asserts the same corner; label resolves to `WGS 84` = EPSG:4326, in the allowlist |
| `rotated-cropped.pdf` | `manual-unsupported` | `embedded` | sole `Map frame` Measure candidate, 4 GCPs |
| `adobe_style_geospatial.pdf` | `manual-ambiguous` | `selection-required` (chooser) | same test asserts exactly 2 candidates; 2+ candidates cannot return anything but `selection-required` |

**This is a documentation defect, not a product defect.** In every case the
observed behaviour is the behaviour the parser unit tests assert, and placing a
file whose CRS *is* in `SUPPORTED_EPSG_CODES` from its embedded coordinates is
correct.

Why no test catches it: `testFixtures.test.ts` pins `test_iso32000.pdf` and
`test_ogc_bp.pdf` to `manual-unsupported` by asserting the **manifest against
itself** —

```ts
expect(fixtureByFile.get("test_iso32000.pdf")).toMatchObject({
  expected: "manual-unsupported", …
});
```

— which is green no matter what the product does. The manifest's `expected`
column has no behavioural oracle behind it.

**Recommended, not actioned, and not approved.** No fixture, manifest or test
is changed in this commit. A future change should either correct the six
`expected` values or bind them to real behaviour; correcting them silently
without an oracle would just move the drift.

## Limits — recorded as unmeasurable, not as passes

- **Long tasks are NOT measurable on this lane.** `longTaskApiSupported` was
  `false` for all 13 fixtures. Firefox does not implement the Long Tasks API;
  `PerformanceObserver.supportedEntryTypes` contains no `longtask`, so the
  observer collects nothing. **An empty list is *no instrument*, not *no long
  tasks*.** The mission's 200 ms threshold **cannot be satisfied on any Firefox
  lane**. It requires a Chromium lane, and Chromium is BLOCKED by the import
  hang, so **that stop-rule item stays open regardless of everything that
  passes here.**
- Import-time request bodies and retained-resource/memory reclamation are not
  captured here. No local-only-network claim and no resource-release claim.
- 0 JS errors and 0 unhandled rejections across all 13 fixtures.

## Claims

- **No acceptance state is claimed in any browser.** This is one lane, one
  browser, one version.
- Chrome stays BLOCKED. Physical Mobile Safari stays `WAITING_FOR_USER`.
- The receipt-integrity question stays open with its ruled-out table in
  `../2026-07-30/stop-rule-1-import-hang/findings.md`.
- Local tests, hosted CI, merge, desktop acceptance, physical-device
  acceptance, deployment and release remain separate claims. **Local tests are
  NOT claimed here** — see the environment note below.
- `GEO_PDF_APPROVED_RULES` unchanged and still empty.

## Environment note — worktree Vitest is currently RED, and is not claimed

`npx vitest run` in this worktree reports **371 failed / 495 passed / 1 skipped
across 867 tests, with 33 suite files failing to load**. The two error classes
are infrastructure-level, not product assertions:

- `React.act is not a function`, raised from
  `react-dom/cjs/react-dom-test-utils.production.js` inside
  `@testing-library/react`; and
- `No such built-in module: node:` for Node builtins under the jsdom
  environment.

Declared and installed versions match (`react` / `react-dom` 19.2.7,
`@testing-library/react` 16.3.2, `vitest` 4.1.10), so this looks like an
incomplete or mismatched install in this worktree's `node_modules`, not a
regression on the branch. **It was not repaired**: `npm ci` deletes
`node_modules`, and the `vite preview` server on :4340 that serves this run's
origin is running out of that directory and was not started by this session.

Recorded so a later reader does not mistake a green browser matrix for a green
test suite. **Local tests remain unclaimed — a failed check is not a pass.**

## Files

| File | What it proves |
| --- | --- |
| `control-matrix.json` | full machine-readable run: per-fixture chooser state, IndexedDB record, registration status and reason, row copy, boundary verdict |
| `control-<fixture>.jpg` | rendered state for each of the 13 fixtures |
| `ff_controls.py` | the harness |

Screenshots are JPEG at 1440 px wide to match the repository's convention in
`docs/research/geopdf-browser-evidence/`.

## Open repository item — RESOLVED 2026-07-31

This directory has been moved from `.acceptance-evidence/` to
`docs/research/acceptance-evidence/` to match the repository's convention,
alongside `docs/research/geopdf-browser-evidence/`. The move was made with
`git mv`, as part of the PR that publishes this branch. Paths written in these
notes before the move refer to the same files at their new location.
