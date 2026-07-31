# Stop rule 1 — legacy post-reload raster: SETTLED as PERSISTED_BUT_OFFSCREEN

Date: 2026-07-30
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
(worktree HEAD `57c3bbf75`; the two commits ahead are documentation only)
Origin: `http://127.0.0.1:4340` — `vite preview` of this worktree's `dist`

## Harness — the Firefox lane. NOT the Chrome extension bridge.

| | Chrome lane (inherited, still BLOCKED) | Firefox lane (this file) |
| --- | --- | --- |
| Driver | Chrome extension bridge, Browser 1 | geckodriver 0.37.1 + Selenium 4.46.0 |
| Delivery | `file_upload` bridge / scripted `DataTransfer` | native `<input type=file>` `send_keys` |
| Size ceiling | hard 10 MB per call (measured) | none |
| Profile | the user's live profile | fresh geckodriver temp profile |

Results from the two lanes are **not interchangeable**. Nothing here closes a
Chrome line item.

## Browser — NOT the receipt's Firefox

**Firefox 152.0.6, buildID 20260713164047**, geckodriver 0.37.1, macOS.

The receipt records Firefox **146.0.1**. 146.0.1 is no longer on disk: a
previous session in this task killed a Firefox process it had not started,
which released a staged update (recorded in
`../firefox-partition/README.md` as session-caused, not an environment fact).

**This run extends the record. It does not reproduce the receipt, and it
cannot close any Firefox line item the receipt left open.**

## Case

The exact rerun the receipt asks for: the legacy `/LGIDict` file, an explicit
main-map frame choice, reload, then a persisted GCP's **Zoom to point**
control before judging the raster.

File: `NH_Isles_of_Shoals_OE_W_20150610_TM_geo.pdf`, 3,241,291 bytes,
sha256 `1e9d8c98ddea13d1…` (verified against
`docs/research/2026-07-27-geopdf-external-corpus.json`). Staged outside every
git repository. **No corpus PDF is in this commit.**

IndexedDB held 0 records at t0 — the fresh profile is a clean-state control,
so nothing here is contaminated by earlier runs.

## The three outcomes, and which one this is

The stop rule required separating three states. Only two of them are bugs.

| Outcome | Discriminator | Measured |
| --- | --- | --- |
| **(a) PERSISTED_BUT_OFFSCREEN** | bytes intact, layer alive, viewport elsewhere; the move repaints it | **THIS** |
| (b) LOST_BYTES | persisted preview blob missing/empty/undecodable | ruled out |
| (c) BLANK_RENDER_DEFECT | bytes intact, viewport over the drape, canvas still paints nothing | ruled out |

### Ruling out (b) — the stored bytes

Read straight out of IndexedDB `ns-marks-the-spot-user-maps` after reload:

| Blob key | Bytes | Type |
| --- | --- | --- |
| `<id>:raster` | 3,241,291 | `application/pdf` |
| `<id>:preview` | 1,114,734 | `image/png` |

`<id>:raster` equals the source file byte-for-byte. The preview was then
decoded **independently, into a canvas the application never touched**:
3213 × 4096, non-transparent fraction **1.000000**, non-white fraction
**0.591785**, mean alpha 254.0. That is real map content, not a blank PNG.
See `reconstructed-preview-from-stored-bytes.png`.

Note the reload path draws the **preview** blob, never `:raster`
(`getRasterBlob` is not called during rehydration), so the preview is the
byte that matters here.

### Ruling out (c) — the canvas was unsized, not blank

After reload and before any move, the layer canvas in
`leaflet-user-maps-pane-pane` was **0 × 0** — present, `opacity: 0.7`, but with
no backing allocated. That is not a failed measurement and not a blank paint;
it is one specific branch in the product code:

`WarpedRasterLayer.redraw()` calls `computeBackingRect(viewRect, drapeRect, …)`,
which returns `null` when `intersectRect(padded, drape)` is empty, and
`redraw()` then does exactly this (`WarpedRasterLayer.ts:438-443`):

```ts
if (!newBacking) {
  canvas.width = 0;
  canvas.height = 0;
  canvas.style.width = "0px";
  canvas.style.height = "0px";
  return;
}
```

**A 0 × 0 canvas is reachable only when the padded viewport does not intersect
the drape.** The mechanism is read out of the source, not inferred from the
symptom.

The harness records `unsized-no-backing-allocated` as its own measured state
precisely so it can never be scored as a blank paint. An earlier revision of
this harness let a `getImageData` `IndexSizeError` on the 0 × 0 canvas fall
through to `None` and be treated as zero; that was luck rather than rigour and
is corrected here.

### Decode latency excluded by observation

A 0 × 0 canvas could in principle mean the bitmap had not finished decoding.
Sampled after reload while touching nothing:

| t since reload | canvas | state | viewport (tile-derived) |
| --- | --- | --- | --- |
| +12.6 s | 0 × 0 | unsized | z12, 43.0046, −66.4893 |
| +25.7 s | 0 × 0 | unsized | z12, 43.0046, −66.4893 |
| +45.8 s | 0 × 0 | unsized | z12, 43.0046, −66.4893 |

Stable and unchanging. Independently, the layer object had already been
constructed and appended — which `WarpedRasterOverlay` only does after the
bitmap decode resolves — so decode was complete throughout.

### The geometry

Drape extent, from the four persisted embedded GCPs:
lat **42.8744 … 43.0005**, lng **−70.7509 … −70.6242**.

| Phase | Viewport (tile-derived) | Canvas | Non-transparent |
| --- | --- | --- | --- |
| pre-reload | z12, 42.9403, **−70.7080** | 744 × 1011 | **0.990672** |
| post-reload, before move | z12, 43.0046, **−66.4893** | 0 × 0 | unsized |
| post-reload, after Zoom to point 1 | z15, 43.0006, **−70.6256** | 2211 × 1407 | **0.997868** |

Post-reload the viewport sits ≈ 4.1° of longitude east of the drape's eastern
edge. At zoom 12 the 1105 px map pane spans ≈ 0.38°, so the drape is roughly
eleven viewport widths away — comfortably non-intersecting, which is why no
backing was allocated.

`Zoom to point 1` → `map.setView([43.00053, −70.62425], max(zoom, 15))` moved
the viewport onto the drape, `moveend`/`zoomend` fired `redraw()`, a backing
was allocated, and the raster repainted at **99.79 % non-transparent**.

## Verdict

**PERSISTED_BUT_OFFSCREEN. This is not a render defect and not data loss.**

The record, the explicit frame choice, the provenance and the embedded points
all survived reload intact. The raster did not repaint on its own because the
viewport is **not restored across reload** — it returns to the default centre
while the drape stays where it was persisted.

Reproduced twice, in two separate browser sessions with different record UUIDs
(`cab7170b-…` and `5638483b-…`), same classification both times.

## Scope — what this does NOT settle

- **The physical Mobile Safari case stays open.** The receipt's blank
  post-reload raster was observed on a physical iPhone 12 Pro. This is desktop
  Firefox. The mechanism found here is a strong candidate explanation for that
  observation, but the device is unavailable and the physical case remains
  `WAITING_FOR_USER`.
- Nothing here transfers to Chrome, where import is still BLOCKED.
- Firefox acceptance is **not** claimed. This is one file and one case.

## Supporting observations from the same run — no acceptance claimed

- **Chooser had no preselection.** Three radios
  (`Quadrangle Location`, `Map Layers`, `UTM Grid and Projection`), **none
  checked**, `Use this frame` **disabled**, and no frame highlight until a
  choice was made. No silent first-or-largest selection occurred.
- **The explicit main-map choice never asked for GCP placement.** After
  choosing `Map Layers` the record offered `Adjust points`, not
  `Georeference`, and persisted `selection: {kind: "user"}` →
  `GeoPDF page 1 · Map Layers · LGIDict · chosen by you`.
- **`RMS 5 m across 4 points`**, identical before and after reload. The
  receipt's Adjust Points table records `NH legacy LGIDict — Map Layers 5 m`.
  This is an independent corroboration of that row on a different browser and
  a different version. It does **not** speak to the receipt-integrity question,
  which is about the Chrome matrix not reproducing at its own baseline.
- Import to chooser: **4.13 s** for 3.2 MB. The same file never completes in
  Chrome 150 on this machine.
- 0 JS errors and 0 unhandled rejections across every phase.
- **Long tasks are NOT measurable on this lane.** Firefox does not implement
  the Long Tasks API — `PerformanceObserver.supportedEntryTypes` has no
  `longtask` entry, so the observer collects nothing. The empty list means
  *unmeasurable*, not *no long tasks*. The mission's 200 ms threshold remains
  unmeasured here and no performance pass is claimed.
- The Leaflet map object could not be reached from the page
  (`mapLookupTier: not-found`), so all viewport geometry above is
  **tile-derived** from loaded `img.leaflet-tile` z/x/y URLs. That is
  independent of the application's own state and is reported as such.

## Recommendation — recommended, not approved

Restoring the viewport across reload, or giving the record row a direct
"zoom to this map" affordance, would remove the surprise. Today the only route
back to a reloaded map's extent is `Adjust points` → `Zoom to`, which is a
georeferencing control being used for navigation. This is a usability finding.
**No change is made in this commit and no acceptance state is claimed.**

`GEO_PDF_APPROVED_RULES` remains empty and is unchanged.

## Reproduce

```
/Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/ffvenv/bin/python \
  ff_stoprule1.py http://127.0.0.1:4340 \
  /Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/corpus/NH_Isles_of_Shoals_OE_W_20150610_TM_geo.pdf \
  300 <outdir>
```

The harness is committed here as `ff_stoprule1.py`. Corpus PDFs stay outside
every git repository.

## Files

| File | What it proves |
| --- | --- |
| `stop-rule-1-result.json` | full machine-readable run: chooser state, IndexedDB dump, settle series, all four render probes, verdict |
| `02-chooser-no-preselection.png` | three frames, nothing preselected, confirm disabled |
| `04-rendered-pre-reload.png` | visible initial render |
| `06-post-reload-before-zoom.png` | record present, raster not on screen |
| `09-post-reload-after-zoom-to-point.png` | visible post-reload repaint |
| `reconstructed-preview-from-stored-bytes.png` | the persisted bytes decoded independently of the app |
| `ff_stoprule1.py` | the harness |

## Open repository item

`.acceptance-evidence/` may need to move under `docs/research/` to match this
repository's convention (`docs/research/geopdf-browser-evidence/` holds the
receipt's 57 screenshots) if this branch becomes a PR. Flagged, not actioned.
