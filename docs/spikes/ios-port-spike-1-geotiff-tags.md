# iOS port spike 1 — GeoTIFF tag reading and ImageIO's limits

Date: 2026-08-13
Spike branch: `spike/geotiff-ifd-reader` (`spikes/geotiff-ifd/`)
Status: **tag reader confirmed; ImageIO has a hole that changes the Phase 8 plan**

## The questions

Phase 8 imports user GeoTIFFs with a hand-rolled tag reader (~300 LOC estimated)
and gets pixels from ImageIO. Two things needed checking:

1. Can a hand-rolled Swift IFD reader reproduce
   `web/src/userMaps/parsers/geoTiffSource.ts`'s georeferencing decisions?
2. Does `CGImageSourceGetCount` expose a GeoTIFF's internal overviews, so the
   web's `chooseImageIndex` overview selection comes free from ImageIO?

## Method

`spikes/geotiff-ifd/` is a mac-native SwiftPM package: a `GeoTIFFTags` target
holding the reader, a `geotiff-probe` executable that puts each fixture through
both the reader and ImageIO, and 15 tests. Fixtures are the repo's
`utm20-8x6.tif` plus six generated with GDAL 3.9 (`Fixtures/`, all under 70 KB,
with `gdalinfo` ground truth): PixelIsPoint, geographic CRS, a rotated
ModelTransformation, BigTIFF, tiled+LZW, and a five-level pyramid.

## Result 1 — the tag reader works, and is the size the plan assumed

282 non-comment lines. All 15 tests pass. It reproduces every georeferencing
rule in `geoTiffSource.ts`:

- ModelTransformation (34264) takes precedence and must be a full 4×4; shorter
  is broken, not partial.
- ModelPixelScale (33550) + ModelTiepoint (33922) otherwise, rejecting more
  than one tiepoint as irregular georeferencing.
- The PixelIsPoint half-pixel shift. Good round-trip evidence here: GDAL wrote
  the `AREA_OR_POINT=POINT` fixture with its tiepoint at the pixel centre
  `(500005, 4999995)`, and the correction recovers `[500000, 10, 0, 5000000, 0,
  -10]` — byte-identical to the PixelIsArea fixture's footprint.
- `ProjectedCSTypeGeoKey ?? GeographicTypeGeoKey`, skipping 32767, falling back
  to the citation strings.

It is bounds-checked throughout, because this is a user-picked file: a
truncated header, an IFD offset past the end, and a self-referential IFD chain
all produce named errors rather than traps, and each has a test.

Two notes for the port:

- **GDAL puts the geo tags on the base directory only.** Overview directories
  carry dimensions and `NewSubfileType = 1` and nothing else, so
  georeferencing must always read directory 0.
- **`GeogCitationGeoKey` (2049) is read by neither surface.** Both the web
  parser and this reader consume only `GTCitationGeoKey` (1026) and
  `PCSCitationGeoKey` (3073). Harmless while a real CRS code is present; a
  user-defined *geographic* CRS would lose its only human label. Phase 8's
  allowlist fails closed on citation strings anyway, so this is a note, not a
  defect.

## Result 2 — ImageIO does not enumerate overviews, and does not need to

`CGImageSourceGetCount` returns **1 for every GeoTIFF tested**, including the
pyramid whose IFD chain the tag reader correctly reports as
`4000x3000, 2000x1500, 1000x750, 500x375, 250x188`. ImageIO also surfaces none
of the geo tags — the TIFF property dictionary has 2–4 keys and nothing
model- or geo-related. So the hand-rolled reader is genuinely required.

But the reason the web needs `chooseImageIndex` does not carry over.
`geotiff.js` has to materialize a whole IFD's pixel grid, so it must pick a
small one. ImageIO's thumbnail path streams instead. On a 12000×9000 (108 Mpx)
striped LZW raster:

| Call | Result | Time | Footprint |
| --- | --- | --- | --- |
| `CGImageSourceCreateThumbnailAtIndex`, max 4096 | 4096×3072 | 684 ms | **+2.9 MB** |
| `CGImageSourceCreateImageAtIndex` + realize pixels | 12000×9000 | 519 ms | **+412 MB** |

**Phase 8 should always build previews through
`CGImageSourceCreateThumbnailAtIndex` with `kCGImageSourceThumbnailMaxPixelSize`
and never through `CGImageSourceCreateImageAtIndex`.** That gets the memory
behaviour overview selection was there to provide, without needing overviews.
412 MB of resident pixels would be a jetsam kill on a phone.

(Watch for a measurement trap here: `CGImageSourceCreateImageAtIndex` is lazy
and returns in microseconds having decoded nothing. My first run reported
"0.0 ms, +0.0 MB" for full decodes. The numbers above force realization with
`kCGImageSourceShouldCacheImmediately` plus a data-provider copy.)

## Result 3 — the hole: ImageIO cannot decode tiled *and* compressed TIFFs

This was not on the risk list and it is the finding that matters.

| Layout | None | PackBits | LZW | DEFLATE | JPEG |
| --- | --- | --- | --- | --- | --- |
| Striped | ok | ok | ok | ok | ok |
| Tiled | ok | ok | **fails** | **fails** | **fails** |

Failure means total: `CGImageSourceCopyPropertiesAtIndex` reports no pixel
dimensions, and both the thumbnail and full-decode calls return nil. There is
no partial result and no error to report to the user beyond "ImageIO refused".

This is not a GDAL artifact. The same files carry identical GDAL checksums to
their striped twins; a tiled+LZW file written by **libtiff** (`tiffcp -t -c
lzw`) fails the same way; and `sips`, which is ImageIO-backed, returns nil
dimensions for exactly the same set.

It matters because tiled + DEFLATE/LZW is what real GIS output looks like —
orthophotos, government raster downloads, and every Cloud-Optimized GeoTIFF are
tiled and compressed by definition. A user importing a typical provincial
raster would hit this, not the happy path.

### iOS confirmation

All of the above was measured on macOS. The target is iOS, so the same two
fixtures (one 256×256 raster written twice by GDAL, tiled+DEFLATE and
striped+DEFLATE, differing only in tiling) go through `CGImageSource` in the
app's test target on an iPhone 17 simulator.

> **Pending** — not yet run. The Apple build slot itself is free; the resource
> gate is holding, on memory pressure 2 with 1.27 GB free swap against its
> 2 GB warning-pressure floor. That is a host condition, not a queue to wait
> out, so this is blocked until the machine has headroom rather than deferred
> by minutes. Result to be appended here; the fixtures and test live at
> `ns-marks-the-spotTests/SpikeImageIOTiledTIFFTests.swift` on the spike branch.

Until it runs, treat Result 3 as macOS-only. It should not be promoted into a
Phase 8 design decision on the assumption that iOS matches — that assumption is
exactly what this leg exists to test.

### Options if iOS behaves like macOS

1. **Hand-roll the strip/tile decode** for DEFLATE (via the `Compression`
   framework) and LZW, plus predictor 2 undo. Bounded at roughly 350–450 LOC on
   top of the tag reader, and consistent with the project's standing decision
   to hand-roll small parsers rather than take dependencies. Covers essentially
   all real GIS output.
2. **Fail closed with an honest state** — a distinct `unsupported-tiled-compressed`
   that names the reason and points at the web map, rather than a generic
   "could not read this file". Cheap, and correct in the meantime under the
   evidence rules: an unreadable file is not an ungeoreferenced one.
3. **Ask for authorization to add a dependency.** The plan anticipated this
   ("only flag a dep if a spike fails"); this is that case. Worth raising, not
   worth assuming.

Recommendation: ship (2) as the default state, then implement (1) for DEFLATE
and LZW. Do not silently route these files to the manual georeferencer — the
georeferencer needs pixels too, so it cannot rescue them either.

## Result 4 — BigTIFF is "no georeferencing", not "no file"

The reader rejects BigTIFF at the header (magic 43; 8-byte offsets and 20-byte
entries are a different structure) exactly as the plan intended. But **ImageIO
reads BigTIFF pixels fine**. So the honest outcome is not a hard reject: the
file opens, the raster is usable, and only its georeferencing is unreadable —
which routes it to the manual georeferencer as a plain scan, the same path the
web takes for a GeoTIFF with no usable tags. Adding real BigTIFF support to the
reader later is roughly 40–60 LOC in the same shape.
