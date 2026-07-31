# Persistence and reload — the remaining four USGS files. All PERSISTED_BUT_OFFSCREEN.

Date: 2026-07-31
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Origin: `http://127.0.0.1:4340` — `vite preview` of this worktree's `dist`
Browser: **Firefox 152.0.6**, buildID `20260713164047`, geckodriver 0.37.1

## What this completes

Stop rule 1 was settled on 2026-07-30 for **one** file, the legacy NH LGIDict
sheet. This run applies the identical harness and the identical three-outcome
discriminator to the **other four** recorded USGS files, so the classification
rests on the whole corpus rather than a single case.

`ff_stoprule1.py` is reused **unchanged** — same file committed at
`../2026-07-30/stop-rule-1-post-reload-raster/ff_stoprule1.py`. One file per
launch, one fresh geckodriver temporary profile per launch.

### Both harness guards hold, structurally and by assertion

The chooser matrix had to add a per-file IndexedDB reset because records
persist across `driver.get()` in a shared profile, making `records[0]` refer to
an earlier file. That failure mode **cannot arise here**: each file gets its
own driver launch with its own fresh temporary profile and imports exactly one
file. The assertion is recorded anyway —
**`idbAtStart.recordCount == 0` for all four files.**

## Result — four of four, same classification as NH

| File | Bytes | To chooser | Radios | Preselected | Confirm | RMS pre → post | Pre-reload painted | Post-reload before move | After `Zoom to point 1` |
| --- | ---: | ---: | ---: | --- | --- | --- | ---: | --- | ---: |
| `ME_Isles_of_Shoals` | 5,831,077 | 4.04 s | 3 | none | disabled | **9 m → 9 m** | 0.985608 | `0 × 0` unsized | **0.996267** |
| `CA_Montara_Mountain` | 9,052,006 | 15.80 s | 4 | none | disabled | **5 m → 5 m** | 0.989420 | `0 × 0` unsized | **0.996522** |
| `CA_San_Francisco_South` | 12,127,762 | 4.05 s | 3 | none | disabled | **8 m → 8 m** | 0.986603 | `0 × 0` unsized | **0.996496** |
| `NH_Hampton` | 35,264,037 | 4.06 s | 3 | none | disabled | **10 m → 10 m** | 0.985734 | `0 × 0` unsized | **0.998650** |

Every RMS matches the receipt's Adjust Points table (ME Map Layers 9 m,
Montara 5 m, San Francisco 8 m, Hampton 10 m) and is **identical before and
after reload**. Every selected candidate id matches the receipt's recorded list.

**Verdict for all four: `PERSISTED_BUT_OFFSCREEN`** — the same classification
the NH file produced twice. Five of five recorded USGS files now agree.

## The distinct proofs, kept separate

The stop rule requires these not be collapsed into one another. Each is a
separate measurement with its own artifact:

| Proof | How it is established | Artifact |
| --- | --- | --- |
| chooser state | radios present, `anyChecked` false, `Use this frame` disabled, no highlight before choice | `*-chooser-no-preselection.jpg` |
| selected candidate | explicit click; persisted `selectedFrameId` matches the receipt's candidate id | `*-stop-rule-1-result.json` |
| provenance | row reads `GeoPDF page 1 · Map Layers · <family> · chosen by you` | `*-post-reload-before-zoom.jpg` |
| GCPs | 4 embedded points, each with pixel and lat/lng, persisted in `georef.gcps` | `*-stop-rule-1-result.json` |
| RMS | Adjust Points panel read before **and** after reload | `*-adjust-points-pre-reload.jpg` |
| visible initial render | layer canvas painted, fraction ≈ 0.986–0.989 | `*-rendered-pre-reload.jpg` |
| reload persistence | record, label, family and `chosen by you` all survive | `*-post-reload-before-zoom.jpg` |
| reconstructed canvas | preview blob decoded **independently, into a canvas the application never touched** | `*-reconstructed-preview-from-stored-bytes.jpg` |
| visible post-reload repaint | after `Zoom to point 1`, fraction ≥ 0.996 | `*-post-reload-after-zoom.jpg` |

### (b) LOST_BYTES ruled out for all four

Stored bytes read straight out of IndexedDB after reload, and **byte-identical
before and after**:

| File | `:raster` | equals source | `:preview` | independent decode |
| --- | ---: | --- | ---: | --- |
| ME | 5,831,077 | exact | 1,166,300 | 3390 × 4096, non-transparent **1.000000**, non-white 0.509934 |
| Montara | 9,052,006 | exact | 2,389,321 | 3213 × 4096, non-transparent **1.000000**, non-white 0.616280 |
| SF South | 12,127,762 | exact | 1,297,120 | 3390 × 4096, non-transparent **1.000000**, non-white 0.598171 |
| Hampton | 35,264,037 | exact | 5,235,515 | 3390 × 4096, non-transparent **1.000000**, non-white 0.425343 |

Real map content, not blank PNGs. The reconstruction fractions are computed
over the **full** decode (1,740,000 sampled pixels; 1,836,000 for Montara); the committed
`*-reconstructed-preview-from-stored-bytes.jpg` files are the harness's
downscaled visual thumbnails of that decode, not the surface that was measured.

### (c) BLANK_RENDER_DEFECT ruled out for all four

In every case the post-reload layer canvas was `0 × 0` and reported as
`unsized-no-backing-allocated` — a distinct measured state, never scored as a
blank paint. That state is reachable only through the one branch in
`WarpedRasterLayer.redraw()` where `computeBackingRect` returns `null` because
the padded viewport does not intersect the drape
(`WarpedRasterLayer.ts:438-443`). `Zoom to point 1` moved the viewport onto the
drape and the raster repainted at ≥ 99.6 % non-transparent in all four.

Decode latency is excluded by the same observation the NH run used: the settle
series sampled `0 × 0` unchanged at roughly +12 s, +25 s and +45 s after reload
while nothing was touched.

## Notes worth recording

- **Montara took 15.80 s to its chooser**, against ~4.05 s for the other three
  including the 33.6 MB Hampton. Montara is 9.1 MB — neither the largest nor
  the smallest. Recorded as an observation; no cause is claimed and no
  performance state is claimed either way. The mission's 200 ms long-task
  threshold cannot be used to investigate it on this lane (see limits).
- **Hampton's preview blob is 5,235,515 B here against 5,248,369 B recorded in
  `../large-file-native-input/`** for the same file on the same build. The
  decoded dimensions are identical (3390 × 4096) and the source raster is
  byte-exact in both, so this is PNG-encode variation between runs, not a
  difference in stored source data. Flagged rather than smoothed over.
- 0 JS errors and 0 unhandled rejections in every phase of all four files.
- The Leaflet map object is unreachable from the page
  (`mapLookupTier: not-found`) in all four, so viewport geometry stays
  tile-derived, as in the NH run.

## Limits — recorded as unmeasurable, not as passes

- **Long tasks are NOT measurable on this lane.** `longTaskApiSupported` was
  `false` in every phase of all four files. Firefox does not implement the Long
  Tasks API; `PerformanceObserver.supportedEntryTypes` contains no `longtask`.
  **An empty list is *no instrument*, not *no long tasks*.** The 200 ms
  threshold **cannot be satisfied on any Firefox lane**; it needs a Chromium
  lane, and Chromium is BLOCKED by the import hang. **That stop-rule item stays
  open regardless of these four results.**
- Import-time request bodies and retained-resource / memory reclamation are not
  captured. No local-only-network claim and no resource-release claim.

## Scope — what this does NOT settle

- **The physical Mobile Safari case stays open.** The receipt's blank
  post-reload raster was observed on a **physical iPhone 12 Pro**. This is
  desktop Firefox. The mechanism identified here is a strong candidate
  explanation for that observation — now consistent across five files rather
  than one — but it is **not a closure**, and the physical case remains
  `WAITING_FOR_USER`.
- Nothing here transfers to Chrome, where import is still BLOCKED.
- Firefox 152.0.6 is not the receipt's 146.0.1. This **extends** the record and
  closes **no** Firefox line item the receipt left open.
- **No acceptance state is claimed in any browser.**
- Local tests, hosted CI, merge, desktop acceptance, physical-device
  acceptance, deployment and release remain separate claims. Local tests are
  not claimed — the worktree's Vitest run is currently RED for
  infrastructure reasons recorded in `../control-fixtures/README.md`.

## Recommendation — recommended, not approved

Unchanged from the NH run and now supported across the whole corpus: restoring
the viewport across reload, or giving the record row a direct "zoom to this
map" affordance, would remove the surprise. Today the only route back to a
reloaded map's extent is `Adjust points` → `Zoom to`, a georeferencing control
used for navigation. **No change is made in this commit.**

`GEO_PDF_APPROVED_RULES` remains empty and unchanged.

## Files

| File | What it proves |
| --- | --- |
| `<file>-stop-rule-1-result.json` | full machine-readable run per file: chooser state, IndexedDB dump, settle series, all render probes, verdict |
| `<file>-chooser-no-preselection.jpg` | full candidate list, nothing preselected, confirm disabled |
| `<file>-rendered-pre-reload.jpg` | visible initial render |
| `<file>-adjust-points-pre-reload.jpg` | four embedded points and the RMS reading |
| `<file>-post-reload-before-zoom.jpg` | record and provenance persisted, raster not on screen |
| `<file>-post-reload-after-zoom.jpg` | visible post-reload repaint |
| `<file>-reconstructed-preview-from-stored-bytes.jpg` | the persisted bytes decoded independently of the app |

Screenshots are JPEG bounded to 1440 px on the long edge, matching the
repository's convention in `docs/research/geopdf-browser-evidence/`. Base64
thumbnails were stripped from the committed JSON because they duplicate those
images. **No corpus PDF is in this commit.**

## Open repository item

`.acceptance-evidence/` may need to move under `docs/research/` to match this
repository's convention if this branch becomes a PR. Flagged, not actioned.
