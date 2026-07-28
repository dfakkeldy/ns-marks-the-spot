# GeoPDF browser acceptance receipt — blocked

Date: 2026-07-28

Exact tested commit: `c9ceb4d78d580722505147214ca398165c94f05f`

Decision: **BLOCKED**

This run confirmed useful browser behavior and fixed two real-corpus parser
defects, but it did not satisfy the separate browser/worker-topology stop rule.
The feature is not fully browser-accepted, deployed, promoted, or shippable.

## Current evidence

The exact commit passed a clean dependency install, the pinned PDF.js asset
check, 981 Vitest tests with one skipped test, lint, TypeScript, and the Vite
production build. The exact production artifact was served at
`http://127.0.0.1:4174/` using the metadata-worker plus main-canvas PDF.js
fallback.

Chrome 150 completed these exact-artifact cases:

- deterministic sole `/Measure` and `/LGIDict` registrations placed
  automatically at 4,096 pixels;
- `byte_and_rgbsmall_2pages.pdf` reported page 1 of 2 and imported only page 1;
- `plain.pdf` opened the zero-point manual georeferencer and retained
  `absent registration` provenance;
- the current ME USGS `/Measure` file opened a three-frame chooser with no
  checked radio and no automatic `Map Layers` selection;
- the legacy NH USGS `/LGIDict` file opened a three-frame chooser with no
  checked radio;
- choosing the main frame or an inset used embedded coordinates and did not
  request manual GCPs;
- Adjust Points showed four existing embedded points for both real formats;
- selected Measure and LGIDict inset provenance survived reload; and
- the Chrome console contained no PDF, worker, asset, warning, or error entry
  after the completed exact-artifact cases.

No producer-specific automatic rule is enabled. The chooser remained the
fallback for every real multi-registration USGS file.

## Confirmed defects fixed

The first Chrome corpus run exposed two independent parser defects:

1. Real current USGS `/Measure` registrations can contain finite `LPTS` control
   coordinates slightly outside the unit square for a rotated control
   quadrilateral. Rejecting those points hid the valid `Map Layers` frame.
   The extractor now retains them while preserving bounding-box clipping,
   affine, mesh, and WGS84 validation.
2. The recorded TerraGo-era files use `/LGIDict` version `2.3`, nested NAD83
   datum dictionaries, exact north-hemisphere UTM zones 10 and 19, embedded
   geographic/Mercator inset definitions, and axis-aligned neatlines with
   sub-nanopoint numeric noise. The extractor now accepts only those evidenced
   variants. A negative regression proves a skewed neatline is still rejected
   rather than reduced to its bounding box.

The external corpus PDFs remained outside Git.

## Five-file discovery corpus

All five files were downloaded from their recorded public USGS sources into
temporary storage. Every recorded byte size and SHA-256 matched:

| File | Bytes | SHA-256 | Observed browser result |
| --- | ---: | --- | --- |
| ME Isles of Shoals, 2024 `/Measure` | 5,831,077 | `9e0e5c17276b6ff0793c29ffc190b0b43e559fd197f0e17c79560adda54a4357` | Exact Chrome: three-frame chooser, main/inset embedded placement, four GCPs, reload pass |
| CA San Francisco South, 2021 `/Measure` | 12,127,762 | `1e64eabdb4df545a651a7721ed808c6199e89df27c7659424ead22a3c9f74732` | Supporting run: chooser and embedded main map pass; exact rerun blocked |
| NH Isles of Shoals, 2015 `/LGIDict` | 3,241,291 | `1e9d8c98ddea13d114e88ca33e0f9ad376fa6f5f9793486cfddf208dc4557ffa` | Exact Chrome: three-frame chooser, main/inset embedded placement, four GCPs, reload pass |
| CA Montara Mountain, 2012 `/LGIDict` | 9,052,006 | `756f06c2c1a826c151bb2a753fe8a8e9efac28557865c37262cd773160961266` | Supporting run: four-frame chooser and geographic inset pass; exact rerun blocked |
| NH Hampton, 2024 `/Measure` | 35,264,037 | `a4b29c41289e5d4dab3ec33f2d0019441c2525aba0c61b498a15da3434bc546b` | Supporting run: about 80 seconds, chooser, 4,096-pixel raster, main/inset pass; exact stress rerun blocked |

The supporting run used the same production parser code before the final
strict Mercator `ScaleFactor` check and receipt commit. It is recorded as
supporting evidence only and is not promoted to exact-SHA acceptance.

## Other browsers

Firefox 146.0.1 and desktop Safari 27.0 were available through desktop control.
Both completed a focused supporting run:

- deterministic sole `/Measure` placement; and
- the real legacy NH three-frame chooser with no preselection, followed by
  embedded `Map Layers · LGIDict · chosen by you` placement without a manual
  georeferencing panel.

Those runs did not cover the complete matrix, console, network, cleanup,
responsive behavior, or the final exact commit. They are partial evidence, not
browser acceptance.

The paired physical phone was reported unavailable, and no accepted physical
Mobile Safari control path was present. The 320×640 Chrome supporting run
proved the three-frame chooser controls were visible and operable, but it is
not a substitute for physical Mobile Safari.

## Unresolved stop rules

The browser gate remains blocked because:

- after six exact-artifact Chrome uploads, the extension stopped delivering
  file-chooser events; closing and reopening the controlled session did not
  unblock exact Montara, San Francisco, or Hampton reruns;
- main-thread long-task recording, interaction latency, and retained-memory
  measurement were unavailable;
- three consecutive normal and stress import-remove cleanup cycles were not
  completed;
- worker, PDF document, object URL, canvas, and memory release were not
  measured;
- the control surface did not expose a network request/body ledger, so the run
  cannot prove that no PDF bytes or upload body crossed the network;
- required screenshots, independently verified selected extents, clipping
  receipts, and candidate IDs were not captured;
- Firefox and desktop Safari remain focused partial runs;
- physical Mobile Safari was unavailable; and
- the full fallback topology matrix therefore did not pass.

No automatic USGS main-map rule can be approved from this corpus. The five
files are discovery inputs, not holdouts. The three exact signatures each
still require two untouched passing holdouts, so approving all proposed
signatures requires at least six new independent files with distinct hashes
and quadrangles. Silent first-frame, largest-frame, or label-only selection
remains prohibited.

## Publication state

PR #180 was already merged into `nightly` at `a21bdd557` before this
continuation began. The follow-up branch commit cannot update that merged PR,
and no replacement PR, deployment, promotion, or production publication was
created by this work.

The machine-readable companion receipt is
`docs/research/2026-07-28-geopdf-browser-acceptance.json`.
