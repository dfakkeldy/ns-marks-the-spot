# Responsive 320×640, import/remove cycles, console and resource failures

Date: 2026-07-31
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Origin: `http://127.0.0.1:4340` — `vite preview` of this worktree's `dist`
Browser: **Firefox 152.0.6**, buildID `20260713164047`, geckodriver 0.37.1

Firefox 152.0.6 is not the receipt's 146.0.1. These results **extend** the
record and close **no** Firefox line item the receipt left open. Nothing here
transfers to Chrome, where import is still BLOCKED. **No acceptance state is
claimed in any browser.**

Both chooser-matrix guards are carried: per-file IndexedDB + UI-state reset,
and an explicit `recordsBeforeImport == 0` assertion. Every phase below
asserted 0.

## A. Responsive 320 × 640 — exact reproduction of the receipt's ledger

Measured at a **true 320 × 640 CSS viewport** with the original long Hampton
filename, control rail open.

| Element | clientWidth / scrollWidth | Receipt (Chrome 150) | Match |
| --- | --- | --- | --- |
| document | **320 / 320** | 320 / 320 | ✓ |
| panel (`#map-controls`) | **287 / 287** | 287 / 287 | ✓ |
| group (`.user-map-group`) | **255 / 255** | 255 / 255 | ✓ |
| card (`.user-map-row`) | **229 / 229** | 229 / 229 | ✓ |
| ordinary row (`.layer-control`) | **255 / 255** | 255 / 255 | ✓ |

**All five values match the receipt exactly**, on a different browser, a
different browser version and a different harness. `scrollWidth == clientWidth`
everywhere, so there is **no horizontal overflow**. `documentOverflows` false.

The long filename `NH_Hampton_20240808_TM_geo` remains visible in the row, and
all three controls are inside the viewport and operable:
`Change frame` 80 × 15, `Adjust points` 74 × 15, `Remove` 45 × 15.

The chooser itself was also exercised at 320 px: 3 radios, `anyChecked` false,
`Use this frame` disabled — the no-preselection rule holds at mobile width too.

### How the 320 px viewport was obtained — and two discarded attempts

Recorded because both produced numbers that must not be used.

**Attempt 1** resized the window. Firefox on macOS clamps to about **500 CSS
px**, so the narrowest viewport reached was 500, not 320 — and it measured
`panel`, `group` and `card` as `clientWidth: 0` and carried on. Zero was not a
measurement: below the mobile breakpoint the control rail
(`aside#map-controls.layer-rail`) is collapsed and has no width until
`.mobile-controls-trigger` adds `.mobile-open`. **Discarded.**

**Attempt 2** fixed the collapsed rail and tried `layout.css.devPixelsPerPx`.
It did not work — `innerWidth` stayed at 500 while `devicePixelRatio` moved, so
the CSS viewport never reached 320. The harness said so explicitly
(`WARNING: innerWidth is 500, not 320`) rather than reporting 500 as 320. Its
rail-open ledger at 500 px is retained in `responsive-320-result.json` for
comparison and is valid **at 500 px only**. **Discarded as a 320 px result.**

**This run** loads the application into a **same-origin iframe sized to exactly
320 × 640**. An iframe establishes its own CSS viewport, so media queries,
layout and overflow inside it behave as in a 320 × 640 window. The harness
**asserts `innerWidth == 320 && innerHeight == 640` before believing anything
it reads**, and rejects the measurement otherwise. `devicePixelRatio` is 2.
IndexedDB is per-origin and therefore shared with the parent document, so the
reset and the zero-records assertion still apply.

That the independently obtained ledger lands on the receipt's five numbers
exactly is the reason this method is trusted; it was checked, not assumed.

## B. Import/remove cycles — 6 of 6 fully cleared

Three normal-size and three 35 MB cycles. **A removal counts only when both the
record and its blobs are gone from IndexedDB**, not when the row leaves the DOM.

| Cycle | File | Import | Records | Blobs | Cleared in | Outcome |
| --- | --- | ---: | --- | --- | ---: | --- |
| normal #1 | ME (5.8 MB) | 7.99 s | 0 → 1 → **0** | 2 → **0** | 0.02 s | cleared |
| normal #2 | ME | 7.95 s | 0 → 1 → **0** | 2 → **0** | 0.01 s | cleared |
| normal #3 | ME | 7.96 s | 0 → 1 → **0** | 2 → **0** | 0.02 s | cleared |
| large #1 | Hampton (33.6 MB) | 9.67 s | 0 → 1 → **0** | 2 → **0** | 0.01 s | cleared |
| large #2 | Hampton | 9.79 s | 0 → 1 → **0** | 2 → **0** | 0.01 s | cleared |
| large #3 | Hampton | 9.70 s | 0 → 1 → **0** | 2 → **0** | 0.01 s | cleared |

Both the record and both blobs (`:raster` and `:preview`) were gone every time,
including for the 33.6 MB file. Import time is stable across repeats — no drift
across three consecutive 33.6 MB cycles.

**Harness intervention, recorded:** removal is guarded by `window.confirm`,
which was overridden to auto-accept so the cycle is deterministic. The calls it
received are captured, e.g. `Remove "NH_Hampton_20240808_TM_geo" from this
device? The original file on your computer is not affected.` The receipt noted
confirmation-dialog delivery was noisy in Chrome; this removes that variable on
this lane rather than papering over it.

**This is deletion from the persisted store, not a memory-reclamation result.**
No retained-object ledger was taken, so resource release remains unproven —
exactly as the receipt left it.

## C. Console and resource failures — clean, with one stated limitation

| Measure | Result |
| --- | --- |
| resource entries observed | 26 |
| `responseStatus` available on entries | yes |
| resources with status ≥ 400 | **0** |
| `console.error` / `console.warn` entries | **0** |
| JS errors | **0** |
| unhandled rejections | **0** |

Resource failures are read from `PerformanceResourceTiming`, which is populated
from page start regardless of when the harness queries it, so the 4xx/5xx check
covers the whole session including boot.

**Limitation, stated rather than glossed:** `console.error` / `console.warn` are
captured by hooks installed immediately *after* `driver.get()` returns.
Anything logged before that point — during very early boot — is not captured.
geckodriver does not support `get_log('browser')`, and WebDriver has no
document-start injection, so this is a real gap in coverage, not a clean bill of
health for boot-time console output. The JS-error and unhandled-rejection
listeners share the same limitation. **The resource-failure ledger does not.**

**No local-only-network claim is made.** Import-time request bodies were not
captured, matching the receipt's own position on both Chrome and Firefox.

## Limits — unmeasurable, not passes

- **Long tasks are NOT measurable on this lane.** `longTaskApiSupported` was
  `false` throughout. Firefox does not implement the Long Tasks API;
  `PerformanceObserver.supportedEntryTypes` contains no `longtask`. **An empty
  list is *no instrument*, not *no long tasks*.** The mission's 200 ms
  threshold **cannot be satisfied on any Firefox lane** — it requires a
  Chromium lane, and Chromium is BLOCKED by the import hang. **That stop-rule
  item stays open regardless of everything that passes here.**
- Retained documents, worker termination, object/blob URL revocation, canvas
  release and memory reclamation are **not** measured. Phase B proves store
  deletion only.

## Claims

- Chrome stays BLOCKED; physical Mobile Safari stays `WAITING_FOR_USER`.
- The receipt-integrity question stays open with its ruled-out table.
- Local tests, hosted CI, merge, desktop acceptance, physical-device
  acceptance, deployment and release remain separate claims. Local tests are
  **not** claimed — the worktree's Vitest run is currently RED for
  infrastructure reasons recorded in `../control-fixtures/README.md`.
- `GEO_PDF_APPROVED_RULES` unchanged and still empty.

## Files

| File | What it proves |
| --- | --- |
| `responsive-320-iframe-result.json` | the accepted 320 × 640 run: asserted viewport, chooser state, full ledger, button geometry |
| `responsive-320-result.json` | the discarded attempt 2, retained so its 500 px numbers stay visible and are not mistaken for 320 px |
| `responsive-cycles-diagnostics.json` | phase A attempt 1 (discarded), all six import/remove cycles, console and resource diagnostics |
| `responsive-320x640-iframe-rail-open.jpg` | the accepted measurement, rail open at 320 × 640 |
| `responsive-320x640-iframe-rail-closed.jpg` | same viewport, rail collapsed — why attempt 1's zeros happened |
| `final-state.jpg` | state after the six cycles |
| `ff_responsive.py`, `ff_responsive320.py`, `ff_responsive320b.py` | the three harnesses, including the two discarded ones |

Screenshots are JPEG bounded to 1440 px on the long edge, matching the
repository's convention. **No corpus PDF is in this commit.**

## Open repository item

`.acceptance-evidence/` may need to move under `docs/research/` to match this
repository's convention if this branch becomes a PR. Flagged, not actioned.
