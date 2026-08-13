# iOS port spike 4 — reading GeoPDF registration with CGPDF

Date: 2026-08-13
Spike branch: `spike/geotiff-ifd-reader` (`spikes/geotiff-ifd/Sources/geopdf-probe/`)
Status: **feasible, no dependency needed**

## The question

Phase 8 of the iOS port needs the GeoPDF frame extraction the web map already
does in `web/src/userMaps/parsers/geoPdfMetadata.ts`. The web reads the PDF
object graph with `pdf-lib`. The native app must not take a third-party PDF
dependency, so the only candidate is CoreGraphics' `CGPDF*` object API.

Can `CGPDFDictionary` / `CGPDFArray` reach the same registration structures —
page `/VP` → `Viewport` → `/BBox` and `/Measure` (`/Type`, `/Subtype`, `/GCS`,
`/LPTS`, `/GPTS`), and page `/LGIDict` → `/CTM`, `/Neatline`, `/Projection` —
and do the values come out the same?

## Method

A `geopdf-probe` executable walks those paths through CGPDF and emits JSON.
The shipping web parser was run over the same 13 fixtures in
`web/src/test/fixtures/geopdf/` (a throwaway vitest that calls
`extractGeoPdfMetadata` and dumps its output). The two dumps were then diffed
numerically rather than by eye.

## Results

**Structure discovery: 13 of 13 fixtures agree with the web parser** — same
number of registration candidates found, same fixtures rejected, and the
rejections land for the same structural reason. In particular:

| Fixture | Web outcome | CGPDF |
| --- | --- | --- |
| `adobe_style_geospatial.pdf` | 2 measure candidates | `/VP` array of 2 |
| `ns-utm20-iso.pdf`, `test_iso32000.pdf` | 1 measure candidate | `/VP` of 1 |
| `ns-utm20-lgidict.pdf`, `test_ogc_bp.pdf` | 1 lgidict candidate | `/LGIDict` of 1 |
| `byte_and_rgbsmall_2pages.pdf` | rejected `unsupported-crs` | `/VP` present, GCS unusable |
| `malformed-measure.pdf` | rejected `invalid` | `/VP` present, point arrays bad |
| `registration-page-2.pdf` | nothing on page 1 | page 1 has no `/VP` or `/LGIDict` |
| `plain.pdf` | nothing | nothing |
| `byte_enc.pdf` | `unreadable` | opens, but `isEncrypted` / `!isUnlocked` |
| `corrupt.pdf` | `unreadable` | `CGPDFDocument(url)` returns nil |

**Numeric agreement: exact.** Recomputing the web's ground-control points from
the CGPDF-extracted `/BBox`, `/LPTS` and `/GPTS` and applying the same viewport
transform reproduces all 20 measure GCPs across five fixtures, worst absolute
difference `4.4e-09` — that residual is my probe's `%.10g` printing, not a
disagreement.

The LGIDict path agrees too. `ns-utm20-lgidict.pdf` carries
`CTM = [10, 0, 0, 10, 500000, 4999940]` and `Neatline = [0,6, 0,0, 8,0, 8,6]`;
applying the CTM lands on `(500000, 5000000)`–`(500080, 4999940)`, which is
exactly the footprint of `utm20-8x6.tif` that fixture was generated from, and
matches the web's WGS84 GCPs once the inverse UTM 20N projection is applied.
`test_ogc_bp.pdf` is geographic, so its CTM output `(2,49)–(3,48)` matches the
web's GCPs with no projection step at all.

CGPDF also exposes everything the surrounding logic needs: the full `/GCS`
dictionary including the WKT string and `EPSG` integer, `/Name` labels,
page rotation, MediaBox and CropBox.

## The one trap, and it is a silent one

The OGC Best Practice encoding writes `/CTM` as a **mixed array of PDF strings
and numbers**:

```
/CTM [ (0.05) 0 0 (0.05) 2 48 ]
```

`CGPDFArrayGetNumber` fails on the string elements, so a reader built only on
that call returns nil for the whole array and **silently loses every OGC BP
GeoPDF** — it looks like "this file has no registration" rather than "I could
not read it". My first probe run did exactly that: `test_ogc_bp.pdf` reported
`CTM = null` while the web parser read it fine.

The web parser already handles this — `scalar()` coerces `PDFString` through a
strict numeric pattern. The Swift port must do the same: try
`CGPDFArrayGetNumber`, fall back to `CGPDFArrayGetString` + the same
`^[+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?$` gate. Anything that fails both is
a genuine reject, not a zero.

## Conclusions for Phase 8

1. CGPDF is sufficient. No PDF dependency is needed for GeoPDF frame
   extraction, and the plan's "hand-roll the small parsers" stance holds.
2. Port `scalar()`'s string coercion before anything else; it is the
   difference between reading and silently dropping OGC BP files.
3. Encryption and corruption are distinguishable at the CGPDF level
   (`isEncrypted`/`isUnlocked` vs a nil document), so the web's separate
   `password-protected` and `invalid-pdf` states survive the port instead of
   collapsing into one failure.
4. The remaining work is not PDF reading — it is the projection math (inverse
   UTM for LGIDict files in a projected CRS), which Phase 8 already plans to
   hand-roll and test against web vectors.
5. `CGPDFArrayGetNumber`-only reads should be banned by a test: add an OGC BP
   fixture to the Swift suite so a regression shows up as a failure rather than
   as an empty result.
