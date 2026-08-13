# iOS port spike 3 — what the triangle warp costs in CoreGraphics

Date: 2026-08-13
Spike branch: `spike/geotiff-ifd-reader` (`spikes/geotiff-ifd/Sources/warp-probe/`)
Host: M1 Pro, macOS 27.0, release build
Status: **the plan's source-size cap is the wrong lever; mip-per-zoom is the right one**

## The question

Phase 8 renders a georeferenced user raster by warping a TPS/affine mesh
triangle-by-triangle inside a custom `MKTileOverlay`. The plan settled on
"grid 64, source capped ≤4096 px" because the web renderer
(`web/src/userMaps/render/mesh.ts`) records per-triangle cost cliffs above
roughly 7–10 Mpx.

Does CoreGraphics behave the same way, and what does one 256×256 tile cost?

The web's own numbers had to be taken on faith: canvas `drawImage` returns once
the command is queued, so its comment records a walk "reporting 8 ms of elapsed
JS time" that actually cost 750 ms of GPU work. A `CGBitmapContext` rasterizes
on the CPU synchronously, so the clock here measures the work itself. That is
the main reason this spike was worth running rather than assuming parity.

## Method

`warp-probe` reproduces the web's inner loop exactly — `saveGState` →
`clip(triangle)` → `concatenate(affineFromTriangles)` → `draw(wholeImage)` →
`restoreGState` — into a 256×256 tile context, with the same affine derivation.
A synthetic source is warped onto a 1024 px destination plane through a mesh
with a mild bulge, so no two triangles share a transform, and the sampled tile
sits in the middle of the plane where it is fully covered.

Every figure is the fastest of five runs after a warm-up, and each was
reproduced across two whole-process runs.

## Result 1 — the cliff is real, and it is minification, not source size

| Source | Mpx | grid 16 (50 tris/tile) | grid 64 (565 tris/tile) |
| --- | --- | --- | --- |
| 1024² | 1.0 | **1.3 ms** | 44.3 ms |
| 2048² | 4.2 | 37.5 ms | 231.3 ms |
| 4096² | 16.8 | 85.9 ms | 508.2 ms |
| 8192² | 67.1 | 233.9 ms | **1309.6 ms** |

So the web's warning transfers: a 4096 px source at the plan's grid 64 costs
**half a second per tile**, and a screen holds tens of tiles. Capping sources at
4096 px does not rescue this — 4096 px is already 508 ms.

But the cause is not the source's absolute size. Interpolation quality, same
4096 px source and grid:

| Quality | ms/tile |
| --- | --- |
| `.none` | 2.1 |
| `.low` | 2.8 |
| `.medium` | 256.3 |
| `.high` | 509.6 |

A 240× spread. CoreGraphics' `.high`/`.medium` do a genuine area average, so
each output pixel costs roughly the number of source pixels it covers. The cost
tracks the *minification ratio*, and the source size only matters because a
bigger source drawn onto the same plane is minified harder.

## Result 2 — a scale-matched mip makes cost independent of source size

Downsample once to the destination scale, then warp from that:

| Source | Strategy | Mip build (once) | ms/tile |
| --- | --- | --- | --- |
| 4096² | direct | — | 510.1 |
| 4096² | mip to 1024², then warp | 38 ms | **46.3** |
| 8192² | direct | — | 1309.5 |
| 8192² | mip to 1024², then warp | 151 ms | **44.5** |

44.5 vs 46.3 — the two sources become **the same cost**, which is the proof that
minification was the whole story. And with the minification gone, interpolation
quality stops dominating too (1024 px mip of an 8192 px source, grid 64):

| Quality | ms/tile |
| --- | --- |
| `.none` | 2.0 |
| `.low` | **2.8** |
| `.medium` | 28.9 |
| `.high` | 44.3 |

`.low` on a scale-matched mip is *not* the quality compromise it would be on a
minified original — the mip already did the area averaging, so the remaining
sampling is near 1:1. **2.8 ms per tile from an 8192 px source**, versus 1310 ms
for the naive path. That is the whole finding.

## Result 3 — mesh density is the remaining tunable

At 1:1 scale, with minification removed, what is left is the fixed cost of one
clipped `drawImage`:

| Grid | Cell (dest px) | Tris/tile | ms/tile |
| --- | --- | --- | --- |
| 8 | 128 | 18 | 1.0 |
| 16 | 64 | 50 | 1.5 |
| 32 | 32 | 163 | 19.4 |
| 64 | 16 | 565 | 44.2 |
| 128 | 8 | 2076 | 77.4 |

Roughly 35–80 µs per clipped draw once past ~150 triangles. Note this counts
triangles *per tile*, which falls as you zoom in: the mesh is fixed in source
space, so a 256 px tile spans fewer cells at high zoom. Grid 64's 565
triangles/tile is the zoomed-out worst case, where the whole raster fits in a
few tiles.

## What this changes in the Phase 8 plan

1. **Drop "source capped ≤4096 px" as a performance constraint.** It does not
   buy what it was meant to buy (4096 px direct is already 508 ms/tile) and it
   is not needed once mipping is in (8192 px mipped is 2.8 ms/tile). A size cap
   is still justified on *memory* grounds — see below — but that is a different
   number chosen for a different reason.
2. **Warp from a per-zoom mip, never from the original.** This is the load-
   bearing decision. Build one scale-matched level per zoom, reuse it across
   every tile at that zoom, and rebuild on zoom change (38–151 ms, off the main
   thread).
3. **Use `.low` interpolation on the mip.** `.high` costs 16× more for quality
   the mip already provides.
4. Grid 64 is affordable in this configuration, so the plan's accuracy choice
   survives on cost grounds. Whether grid 64 is *needed* is a separate question
   this spike did not measure — and `gcpMesh.ts`'s error figures are not
   monotone in grid size (12 beats 16), so settle it against that harness rather
   than assuming denser is better.

**The mip builder is already specified by spike 1.**
`CGImageSourceCreateThumbnailAtIndex` with `kCGImageSourceThumbnailMaxPixelSize`
produced a 4096×3072 preview of a 108 Mpx raster for **+2.9 MB**, against
+412 MB for a full decode. Setting that max size per zoom level *is* the
scale-matched mip, built by streaming without ever holding full-resolution
pixels. So the two spikes compose into one pipeline:

> per zoom → `CGImageSourceCreateThumbnailAtIndex` at the destination scale →
> triangle warp with `.low` → 256×256 tile

and the real source ceiling is a memory ceiling on the *mip*, not on the file.
An 8192² RGBA buffer is 268 MB resident and would be a jetsam kill on a phone;
a 1024–2048 px mip is 4–16 MB.

## Caveats

- Measured on an M1 Pro under macOS, not on device. Absolute values will differ
  on an iPhone; the ratios that drive the decisions above should not, since they
  come from algorithmic behaviour rather than clock speed. The device leg of
  this spike (tile latency and memory inside a real `MKTileOverlay`) still needs
  the Apple build slot.
- Single-CGImage reuse across configurations moved one identical measurement by
  6× (grid 16 read 9.4 ms sharing a source, 1.5 ms with a fresh one) —
  CoreGraphics carries cached state against a `CGImage`. Each row here builds
  its own source. Worth remembering when benchmarking the real renderer.
- One-time costs must be measured cold: a best-of-N on the mip build reported
  0 ms because CoreGraphics cached the scaled variant.
- `String(format: "%s", swiftString)` segfaults (it reads the String struct's
  bits as a `char *`). It first showed up as mojibake in a results column, which
  is a good reminder that a garbled probe output is a bug, not cosmetics.
