# Multi-frame chooser matrix — 10 of 10 frames explicit, embedded, no GCP prompt

Date: 2026-07-31
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Origin: `http://127.0.0.1:4340` — `vite preview` of this worktree's `dist`

## Harness — the Firefox lane. NOT the Chrome extension bridge.

| | Chrome lane (inherited, still BLOCKED) | Firefox lane (this file) |
| --- | --- | --- |
| Driver | Chrome extension bridge, Browser 1 | geckodriver 0.37.1 + Selenium 4.46.0 |
| Delivery | `file_upload` bridge / scripted `DataTransfer` | native `<input type=file>` `send_keys` |
| Size ceiling | hard 10 MB per call (measured) | none |

**Firefox 152.0.6, buildID 20260713164047** — *not* the receipt's 146.0.1.
This extends the record; it reproduces nothing and closes no Firefox line item
the receipt left open. Nothing here transfers to Chrome.

## Files

Three real multi-registration USGS files, staged outside every git repository.
**No corpus PDF is in this commit.**

| File | Bytes | Flavor | Frames |
| --- | --- | --- | --- |
| `NH_Isles_of_Shoals_OE_W_20150610_TM_geo.pdf` | 3,241,291 | LGIDict | 3 |
| `ME_Isles_of_Shoals_20240805_TM_geo.pdf` | 5,831,077 | Measure | 3 |
| `CA_Montara_Mountain_OE_W_20120515_TM_geo.pdf` | 9,052,006 | LGIDict | 4 |

Each file ran with IndexedDB and the `user-map-ui-state-v1` key deleted first;
`recordsBeforeImport` was **0** for all three. See "Harness defect found and
fixed" below — this isolation is not cosmetic.

## Result: every frame, chosen explicitly, placed from embedded coordinates

**10 of 10 frames.** Not just the main map — every inset too.

| File | Frame | Selection | Status | GCPs | RMS | Receipt | Painted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NH LGIDict | Quadrangle Location | `user` | embedded | 4 | 0 m | 0 m ✓ | 0.9906 |
| NH LGIDict | **Map Layers** | `user` | embedded | 4 | 5 m | 5 m ✓ | 0.8752 |
| NH LGIDict | UTM Grid and Projection | `user` | embedded | 4 | 7 m | 7 m ✓ | 0.9917 |
| ME Measure | **Map Layers** | `user` | embedded | 4 | 9 m | 9 m ✓ | 0.9856 |
| ME Measure | Quadrangle Location | `user` | embedded | 4 | 0 m | 0 m ✓ | 1.0000 |
| ME Measure | Adjoining Sheet Diagram | `user` | embedded | 4 | 0 m | 0 m ✓ | 0.9497 |
| Montara LGIDict | Quadrangle Location | `user` | embedded | 4 | 0 m | 0 m ✓ | 0.9950 |
| Montara LGIDict | **Map Layers** | `user` | embedded | 4 | 5 m | 5 m ✓ | 0.8775 |
| Montara LGIDict | Adjoining Quadrangles Diagram | `user` | embedded | 4 | 0 m | 0 m ✓ | 1.0000 |
| Montara LGIDict | UTM Grid and Projection | `user` | embedded | 4 | 6 m | 6 m ✓ | 0.9805 |

"Painted" is the non-transparent fraction of the layer canvas, read with
`getImageData` — every frame produced a visible render, not merely a record.

### No silent selection

For all three files, on the **first** presentation:

- radios present: 3 / 3 / 4;
- **`anyChecked` false** — nothing preselected;
- **`Use this frame` disabled**;
- no `geopdf-frame-highlight` element until a choice was made.

No file reached an embedded placement without an explicit choice. The harness
carries an explicit `SILENT_SELECTION_DEFECT` branch for the case where a
chooser never appears yet the record persists `selection.kind != "sole"`; it
did not fire.

This is consistent with the source: `GEO_PDF_APPROVED_RULES` is empty, so
`selectGeoPdfFrame` can only return `sole` (exactly one candidate) or
`selection-required` (two or more). There is no first-or-largest path.

### Reopening pre-checks the current frame — correct, and not the same thing

`Change frame` reopens the chooser with the **currently selected** frame
checked. That is the intended behaviour for an already-`embedded` record and is
recorded separately (`reopenedChooserPrechecked`) so it can never be confused
with the initial-presentation rule above. Verified each time: the pre-checked
value equalled the previously chosen candidate id.

### No supported frame requested GCP placement

For all 10 frames the row offered **`Adjust points`**, never `Georeference`;
the enable checkbox was **not** disabled; no `Needs georeferencing` /
`Choose frame` badge was present; and the persisted registration was
`status: "embedded"` with 4 embedded GCPs. `requestsGcpPlacement` was false in
every case.

Row provenance contained `chosen by you` for all 10, e.g.
`GeoPDF page 1 · Map Layers · LGIDict · chosen by you`.

## Cross-check against the receipt

**Every candidate id matched the receipt exactly** for all three files
(`candidateIdsMatchReceipt: true` × 3), and **every RMS value matched** the
receipt's Adjust Points table — 10 of 10.

This corroborates the receipt's parser and registration-extraction side on a
different browser, a different browser version and a different harness.

It does **not** address the open receipt-integrity question, which is narrower:
a recorded Chrome matrix that does not reproduce at its own baseline
`4c46ca276` on the same major version. That question stays open with its
ruled-out table in `../2026-07-30/stop-rule-1-import-hang/findings.md`.

## Visual proof that placement is geographic, not nominal

`CA_Montara_Mountain-frame2-Adjoining_Quadrangles_Diagram.jpg` is the strongest
single image here: the adjoining-quadrangles index diagram lands over the real
San Francisco Bay coastline at `Z 10 · 37.56309, -122.56279`, its six cells
aligned to the actual quadrangle grid, with `Montara Mountain OE W` — the
subject sheet — outlined in red in the correct cell. RMS 0 m, painted 1.0000.
An inset placed by guesswork could not do that.

## Harness defect found and fixed — recorded because it produced wrong numbers

The first run of this matrix reported `ME Map Layers = RMS 7 m` against the
receipt's 9 m, and `Montara Quadrangle Location = 7 m` against 0 m. **Those
numbers were wrong and were a harness defect, not a product finding.**

Records persist in the shared Firefox profile across `driver.get()`, so with
three files imported in sequence `records[0]` and `rows[0]` still referred to
the **first** file. The 7 m readings were NH's UTM frame being read while a
later file was under test.

Fixed by deleting IndexedDB and the UI-state key before each file and asserting
`recordsBeforeImport == 0`. After the fix all 10 values matched the receipt.
Recorded here so a later reader does not find the discarded numbers and mistake
them for evidence.

A second harness bug in the same run — the reopened chooser being clicked
before its preview had mounted — was fixed by polling for the radio instead of
sleeping a fixed interval.

## Limits — recorded as unmeasurable, not as passes

- **Long tasks are NOT measurable on this lane.** Firefox does not implement
  the Long Tasks API; `PerformanceObserver.supportedEntryTypes` contains no
  `longtask`, so the observer collects nothing.
  `longTaskApiSupported: false` in every phase of every file. An empty list
  means *no instrument*, not *no long tasks*. The mission's 200 ms threshold
  therefore **cannot be satisfied on any Firefox lane** — it needs a Chromium
  lane, and the Chromium lane is currently BLOCKED by the import hang. **That
  stop-rule item stays open no matter how much Firefox work succeeds.**
- The Leaflet map object is unreachable from the page, so viewport geometry is
  **tile-derived** from `img.leaflet-tile` z/x/y URLs plus the application's own
  on-screen `Z … · lat, lng` readout. In the stop-rule-1 run the two agreed —
  tile-derived `z12 / 43.0046 / −66.4893` against the on-screen
  `Z 12 · 43.00000, −66.50000`. Agreement between two independent derivations
  is the reason the geometry is trusted; it was checked, not assumed. In this
  run the readout regex did not match the element, so only the tile-derived
  value is recorded per frame.
- 0 JS errors and 0 unhandled rejections across all three files.

## Claims

- **No acceptance state is claimed in any browser.** This is one lane, one
  browser, one version, three files.
- Chrome stays BLOCKED. The Chrome chooser path for San Francisco South and
  Hampton stays UNPROVEN.
- Physical Mobile Safari stays `WAITING_FOR_USER`.
- Local tests, hosted CI, merge, desktop acceptance, physical-device
  acceptance, deployment and release remain separate claims.

## `GEO_PDF_APPROVED_RULES` — still empty, still not recommended

Unchanged: `export const GEO_PDF_APPROVED_RULES: readonly ApprovedGeoPdfRule[] = [];`

This matrix **weakens** rather than strengthens the case for a
producer-specific automatic main-map rule. Every one of the three files
presented an unambiguous, correctly labelled `Map Layers` frame that a user
selected in one click, and every inset was equally valid and correctly placed —
`Quadrangle Location` and the adjoining diagrams are legitimate choices a user
may want, not noise to be ruled out. Automatic selection would remove a working
choice to save one click, while the receipt's holdout result already shows the
proposed producer key cannot match these files (`pdf-lib` returns a null
`Producer`; ArcSOC appears in `Creator`).

**Recommended, not approved: do not add a rule.** If one is ever pursued,
re-keying to `Creator` defines a *new* selector and requires a freshly frozen,
independent holdout evaluation.

**Are more independent USGS files needed?** For the chooser behaviour itself,
no — 10 of 10 frames across two registration families and three quadrangles is
a consistent result with no counter-example. For approving an automatic
selector, yes, and materially more: the frozen holdout of 12 files already
produced current-Measure cases exceeding the 1 source-pixel / 5 projected-metre
gate plus unsupported-CRS cases, so a new selector would need a fresh holdout
larger than the discovery set and drawn from quadrangles not used here.

## Files

| File | What it proves |
| --- | --- |
| `chooser-matrix.json` | full machine-readable matrix: chooser state per file, every frame's registration, RMS, points, canvas fraction, IndexedDB dump |
| `<file>-frame<N>-<Label>.jpg` | rendered extent for each of the 10 frames |
| `ff_chooser.py` | the harness |

Screenshots are JPEG at 1440 px wide to match the repository's existing
convention in `docs/research/geopdf-browser-evidence/`. The earlier
stop-rule-1 directory used full-size PNGs; that is noted, not rewritten.

## Open repository item — RESOLVED 2026-07-31

This directory has been moved from `.acceptance-evidence/` to
`docs/research/acceptance-evidence/` to match the repository's convention,
alongside `docs/research/geopdf-browser-evidence/`. The move was made with
`git mv`, as part of the PR that publishes this branch. Paths written in these
notes before the move refer to the same files at their new location.
