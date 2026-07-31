# Large-file native input — the 10 MB win, taken on the Firefox lane

Date: 2026-07-31
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Origin: `http://127.0.0.1:4340` — `vite preview` of this worktree's `dist`
Browser: **Firefox 152.0.6**, buildID `20260713164047`, geckodriver 0.37.1

## Why this run exists

The inherited Chrome lane could not deliver these two files at all. The
extension bridge enforces a hard **10 MB per-call ceiling, measured**:
9,052,006 B accepted, 12,127,762 B rejected.

**The application never rejected them. The browser bridge did.** Selenium's
native `<input type=file>` `send_keys` has no such ceiling, so this lane can
deliver them.

| | Chrome lane | Firefox lane (this file) |
| --- | --- | --- |
| Delivery | `file_upload` bridge / scripted `DataTransfer` | native `<input type=file>` `send_keys` |
| Size ceiling | hard 10 MB per call | none |

## Result — both files imported through genuine native input

| File | Bytes | To chooser | Frames | Outcome |
| --- | --- | --- | --- | --- |
| `CA_San_Francisco_South_OE_W_20211202_TM_geo.pdf` | 12,127,762 (11.6 MB) | 4.06 s | 3 | all explicit, all embedded |
| `NH_Hampton_20240808_TM_geo.pdf` | 35,264,037 (33.6 MB) | 4.07 s | 3 | all explicit, all embedded |

Both had IndexedDB reset first; `recordsBeforeImport` was 0 for both.

### The product stored the full bytes

Read back out of IndexedDB after import:

| File | `<id>:raster` | matches source | `<id>:preview` |
| --- | --- | --- | --- |
| San Francisco South | 12,127,762 B `application/pdf` | exact | 1,297,120 B `image/png` |
| Hampton | 35,264,037 B `application/pdf` | exact | 5,248,369 B `image/png` |

This is positive confirmation of the inherited conclusion: the 10 MB limit was
a **harness limitation, not a product defect**. The product accepts and
persists a 33.6 MB GeoPDF byte-for-byte.

### Every frame, chosen explicitly, placed from embedded coordinates

| File | Frame | Selection | Status | GCPs | RMS | Receipt | Painted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SF South | **Map Layers** | `user` | embedded | 4 | 8 m | 8 m ✓ | 0.9866 |
| SF South | Quadrangle Location | `user` | embedded | 4 | 0 m | 0 m ✓ | 1.0000 |
| SF South | Adjoining Sheet Diagram | `user` | embedded | 4 | 0 m | 0 m ✓ | 0.9514 |
| Hampton | **Map Layers** | `user` | embedded | 4 | 10 m | 10 m ✓ | 0.9857 |
| Hampton | Quadrangle Location | `user` | embedded | 4 | 0 m | 0 m ✓ | 1.0000 |
| Hampton | Adjoining Sheet Diagram | `user` | embedded | 4 | 0 m | 0 m ✓ | 0.9495 |

Both choosers arrived with **zero checked radios and a disabled confirm**; all
candidate ids matched the receipt; no frame requested GCP placement — every row
offered `Adjust points`, never `Georeference`, with an enabled checkbox and no
`Needs georeferencing` badge.

### Raster stress

Hampton is the raster-stress case. It reached its chooser in 4.07 s, produced a
5,248,369 B page-1 preview, and every frame painted a visible canvas
(0.9495–1.0000 non-transparent). Both files decode to a 3390 × 4096 preview,
consistent with the application's at-most-4,096² preview bound.

This is import and render under stress on this lane. It is **not** a memory or
retained-resource result — see limits.

## Combined with the 2026-07-31 chooser matrix

Across the two runs: **16 embedded frames over all five recorded USGS files**,
every one selected explicitly from an initially unselected chooser, every one
using four embedded points. That is the same frame count the receipt records
for its Chrome matrix, and every RMS value and candidate id matches.

## Claims — and what stays UNPROVEN

- **The Chrome chooser path for San Francisco South and Hampton stays
  UNPROVEN.** A Firefox result does not close a Chrome gap. Chrome import is
  still BLOCKED at any size, including a 2 KB fixture.
- **No acceptance state is claimed in any browser.**
- Firefox 152.0.6 is not the receipt's 146.0.1; this extends the record and
  reproduces nothing.
- Physical Mobile Safari stays `WAITING_FOR_USER`. The receipt's 5.8 MB Maine
  page-process reset was a *physical iOS* observation and is untouched here.
- Local tests, hosted CI, merge, desktop acceptance, physical-device
  acceptance, deployment and release remain separate claims.

## Limits — unmeasurable, not passes

- **Long tasks are not measurable on any Firefox lane.** The Long Tasks API is
  not implemented; `PerformanceObserver.supportedEntryTypes` has no `longtask`.
  An empty list is *no instrument*, not *no long tasks*. Satisfying that
  stop-rule item requires a Chromium lane, which is BLOCKED — so it stays open
  regardless of Firefox results, including this one on the 33.6 MB file.
- Import-time **request bodies** and **retained-resource / memory reclamation**
  are not captured here. No local-only-network claim and no resource-release
  claim is made from this run.
- Viewport geometry is tile-derived plus the application's on-screen readout;
  the Leaflet map object is unreachable from the page.

`GEO_PDF_APPROVED_RULES` unchanged and still empty. No corpus PDF committed.

## Files

| File | What it proves |
| --- | --- |
| `large-file-matrix.json` | full machine-readable run: chooser state, per-frame registration, RMS, canvas fractions, IndexedDB byte counts |
| `<file>-frame<N>-<Label>.jpg` | rendered extent for each of the 6 frames |

Harness: `../multi-frame-chooser-matrix/ff_chooser.py`, unchanged.

## Open repository item

`.acceptance-evidence/` may need to move under `docs/research/` to match this
repository's convention if this branch becomes a PR. Flagged, not actioned.
