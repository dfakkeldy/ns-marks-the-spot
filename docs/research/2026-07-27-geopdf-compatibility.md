# GeoPDF Compatibility Spike

## Environment

- Repository baseline: `66c2d4f4803365c7b3741f14e45888ba1bfe8715`
- Task branch: `feature/web-geopdf-import`
- Retrieval and probe date: 2026-07-27, America/Halifax
- Node.js: `v22.23.1`
- npm: exact lockfile install with zero reported vulnerabilities
- GDAL: `GDAL 3.9.0, released 2024/05/07 (debug build)`
- Baseline verification: 917 tests passed, one existing live-service test
  skipped; lint and build exited zero

Local verification, hosted CI, merge, deployment, and browser/device acceptance
remain separate states. This report contains no hosted-CI, merge, deployment,
or device-acceptance claim.

## Dependency API verification

The candidate runtime is pinned exactly:

- `pdfjs-dist@6.1.200` (Apache-2.0; Node engine
  `>=22.13.0 || >=24`)
- `pdf-lib@1.17.1` (MIT)

Official PDF.js documentation confirms that `getDocument({ data: Uint8Array })`
is a public display API, transfers typed-array ownership to its worker-backed
path, exposes `loadingTask.onPassword`, and renders a numbered page to a canvas.
Official pdf-lib source documentation confirms `PDFDocument.load/create`,
dictionary lookup, crop boxes, and `save({ useObjectStreams: false })`.

The installed exact versions were also checked directly. pdf-lib exports
`PDFDocument`, `PDFName`, `PDFArray`, `PDFDict`, `PDFNumber`, `PDFString`, and
`PDFHexString`, and the committed probe resolves page dictionaries using those
public objects. No PDF.js internal object is used for registration.

## Corpus and hashes

The five small tracked OSGeo/GDAL inputs matched their required upstream
SHA-256 values exactly. The repository generator then produced eight stable
files twice with byte-for-byte identical hashes. Its two UTM 20N outputs
matched the 8 by 6 source raster:

```text
CRS: EPSG:26920, NAD83 / UTM zone 20N
size: [8, 6]
geotransform: [500000, 10, 0, 5000000, 0, -10]
```

The OGC best-practice conversion emits GDAL's existing “Non closed ring”
warning, but GDAL still reports the same CRS, size, geotransform, bounds, and
pixel-to-map mapping.

Five official USGS files were kept outside Git and are pinned in
`2026-07-27-geopdf-external-corpus.json`:

| Run | Bytes | SHA-256 | Page-1 registrations | Result |
| --- | ---: | --- | --- | --- |
| ME Isles of Shoals, 2024-08-05 | 5,831,077 | `9e0e5c17276b6ff0793c29ffc190b0b43e559fd197f0e17c79560adda54a4357` | 3 `/Measure` | manual-ambiguous |
| CA San Francisco South OE W, 2021-12-02 | 12,127,762 | `1e64eabdb4df545a651a7721ed808c6199e89df27c7659424ead22a3c9f74732` | 3 `/Measure` | manual-ambiguous |
| NH/ME Isles of Shoals OE W, 2015-06-10 | 3,241,291 | `1e9d8c98ddea13d114e88ca33e0f9ad376fa6f5f9793486cfddf208dc4557ffa` | 3 `/LGIDict` | manual-ambiguous |
| CA Montara Mountain OE W, 2012-05-15 | 9,052,006 | `756f06c2c1a826c151bb2a753fe8a8e9efac28557865c37262cd773160961266` | 4 `/LGIDict` | manual-ambiguous |
| NH Hampton large control, 2024-08-08 | 35,264,037 | `a4b29c41289e5d4dab3ec33f2d0019441c2525aba0c61b498a15da3434bc546b` | 3 `/Measure` | manual-ambiguous |

All five files contain one page. Page 1 was the only page probed. No later page
was imported. The separate two-page tracked controls report `pageCount: 2`;
their later pages are explicitly not imported.

## `/Measure` results

The tiny ISO 32000 fixture and the generated UTM 20N control each expose one
valid viewport and are readable through pdf-lib's public APIs. That proves the
low-level dictionary path, not a shippable producer family.

Every current USGS real file instead exposes three valid page-1 viewport
registrations:

1. `Map Layers`
2. `Quadrangle Location`
3. `Adjoining Sheet Diagram`

Each has a `/Measure` dictionary, eight `GPTS` scalars, and a distinct bounding
box. The brief forbids selecting one when page 1 has multiple registrations.
Names and relative sizes are not an authorized tie-breaker. Therefore the
current Esri ArcSOC `/Measure` structure is `manual-unsupported`.

`adobe_style_geospatial.pdf` independently exercises two `/Measure` map frames
and is also `manual-ambiguous`.

## `/LGIDict` results

The tiny OGC best-practice fixture and generated UTM 20N control expose one
readable `/LGIDict` and prove that pdf-lib can resolve its arrays, strings,
names, and dictionaries without a PDF.js internal.

Both independent TerraGo-era USGS products expose arrays, not a single
registration. The 2015 file contains `Quadrangle Location`, `Map Layers`, and
`UTM Grid and Projection`. The 2012 file adds `Adjoining Quadrangles Diagram`.
Every entry has its own projection, CTM, and neatline. Selecting `Map Layers`
would violate the same no-selection rule. The USGS `/LGIDict` structure is
therefore `manual-unsupported`.

## GDAL coordinate comparison

GDAL independently reads all five external files and produces the exact frozen
CRS and affine geotransforms in the corpus ledger. It also confirms that the
two generated registration families reproduce the tracked source raster
exactly.

GDAL chooses a map frame when reporting one external raster. The browser
feature is not allowed to reproduce that choice because page 1 contains
multiple registrations. Consequently no application extractor coordinate was
accepted for comparison:

- maximum accepted disagreement: not applicable;
- accepted canonical-raster-pixel threshold: none;
- accepted ground-metre threshold: none.

This is a fail-closed result, not an unlimited tolerance. A later proposal may
not raise a threshold or reinterpret `Map Layers` as uniquely selected to turn
these failed corpus files into passes. A new approved design and a new
independent acceptance run would be required.

## Worker topology and responsiveness

Two disposable browser paths were built:

1. pdf-lib plus PDF.js in a feature worker, rendering page 1 through
   `OffscreenCanvas`;
2. pdf-lib in a feature worker returning the transferred buffer, followed by
   PDF.js's supported worker-backed display path and an opaque main-thread
   canvas.

Both paths fixed the canonical longest edge at exactly 4,096 pixels, used the
page-1 viewport so crop/rotation/aspect ratio were preserved, painted an opaque
white background, reported `pageCount`, and did not import later pages.
Encrypted input was mapped to a typed “unlock/export before import” error with
no password UI.

No topology is accepted. Local Playwright could not start either Chrome binary:
macOS rejected the browser's Mach rendezvous registration before a page opened.
The connected Chrome session loaded the local spike page, but local-file
selection was disabled and the local bundled-asset retry remained idle. Thus
there is no honest page-render, 4,096-output, duration, longest-task, or memory
measurement. Firefox, Safari, and mobile Safari were not exercised after the
registration stop rule had already failed. The disposable UI, workers, and
corpus copies were deleted.

These are explicit evidence limitations, not browser failures and not browser
acceptance.

## Bundle experiment

The dependencies are pinned at runtime but are not imported by product code in
this blocked spike. PDF assets remain outside the initial request, and the
production build does not add a GeoPDF bundle or fixture download. The
dependencies cannot be called shipped until a separately approved
implementation establishes dynamic loading and passes the browser matrix.

## Supported matrix

The required family-level support result is frozen here and in
`web/src/test/fixtures/geopdf/manifest.json`.

| Family | Exact real producer/structure tested | Result | Reason |
| --- | --- | --- | --- |
| `measure` | Esri ArcSOC 10.8.1.14362; page-1 `/VP` array of three registered frames | `manual-unsupported` | Two independent publication runs plus the large control are ambiguous. |
| `lgidict` | ESRI ArcSOC 10.0.2.3200; page-1 `/LGIDict` array of three or four registrations | `manual-unsupported` | Two independent TerraGo-era publication runs are ambiguous. |

Tiny single-registration fixtures remain test oracles only. They do not
override the real-producer support matrix.

## Stop-rule decision

**BLOCKED.** Neither registration family passed the required independent real
corpus. Automatic GeoPDF placement must not be implemented, and Tasks 2–9 must
not begin from this result.

A user may still import a renderable page 1 for manual georeferencing when
registration is missing, unsupported, unsupported-CRS, invalid, or ambiguous.
That policy does not authorize the later feature work in this task. Corrupt PDF
bytes remain an invalid-PDF error, and password-protected input remains the
typed unlock/export error.
