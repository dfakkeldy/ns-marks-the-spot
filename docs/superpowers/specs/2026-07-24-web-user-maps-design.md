# Web "Your Maps" — User-Loaded GeoTIFF/GeoPDF + In-Browser Georeferencer — Design

**Date:** 2026-07-24
**Status:** Approved 2026-07-24; amended same day after adversarial review
(Codex gpt-5.6-sol): pane slot pinned to z-160, mesh density corrected,
renderer cadence stated precisely, alpha/nodata scoped out of PR 1
**Author:** Claude (with Dan Fakkeldy)

## Goal

Let web-map users load their **own** raster maps — GeoTIFFs, GeoPDFs, or plain
scanned images — and drape them over Nova Scotia with the app's signature
transparency slider. Files with embedded georeferencing render immediately;
plain scans (and GeoPDFs we can't read) go through a first-class in-browser
**georeferencer**: click matching points on the scan and the live map, watch
the warp solve in real time.

Everything runs **fully client-side**. The static-hosting deploy has no
backend, so "upload" means "open a local file": nothing ever leaves the user's
device. That is simultaneously the privacy story, the hosting-cost story, and
the licensing story — the site redistributes nothing, which is exactly the
constraint that keeps Fletcher/Church scans off the web today
(`web/src/layers/layerCatalog.ts` "rights-pending" rows). Users who obtain a
Rumsey scan for personal use can view it themselves without the project
hosting a single tile.

Primary motivation: **portfolio piece.** The georeferencer is the demo that
reads in ten seconds — drop in an old map, click four points, watch it snap
onto Nova Scotia.

## Scope decisions (locked with maintainer 2026-07-24)

| Decision | Choice | Rationale |
|---|---|---|
| **Scope** | Everything: GeoTIFF + georeferencer (affine → TPS) + Allmaps export + GeoPDF | Maintainer chose the full suite over phased-scope alternatives. GeoPDF is last and isolated. |
| **Dependencies** | `geotiff.js`, `proj4`, `pdf.js` only | TIFF decode and PDF rasterization are not sanely hand-rollable; proj4 handles arbitrary user CRSs. Rendering and all transform math are hand-rolled and unit-tested. No `georaster*` convenience deps. |
| **Rendering** | Approach B: one custom `WarpedRasterLayer` (canvas + triangulated mesh) | One path serves embedded-georef rasters, affine, and TPS; live re-solve during GCP drags needs mesh redraw speed, not tile rebuilds. Tiling can later hide behind the same interface if perf demands. |
| **Module boundary** | New `web/src/userMaps/` feature folder; `App.tsx`/`MapCanvas.tsx` gain only mounting points | `App.tsx` (~2,900 lines) and `MapCanvas.tsx` (~1,800) must not grow. Hard requirement. |
| **Storage** | IndexedDB, hand-rolled minimal wrapper | Survives reloads with zero server code; no new dependency for a ~100-line need. |
| **GeoPDF failure mode** | Degrade to the georeferencer ("treat as plain scan") + `gdal_translate` hint | A broken GeoPDF is a working scan, not a dead end. Removes most of the format risk. |

## Architecture

### Module layout

```
web/src/userMaps/
  parsers/
    sniff.ts            magic-byte file-type detection (never trust extensions)
    geoTiffSource.ts    geotiff.js wrapper: decode, geokeys→CRS, overview selection
    geoPdfSource.ts     pdf.js page-1 rasterization + georegistration extraction
    imageSource.ts      plain JPG/PNG decode for the georeferencer
  transform/
    affine.ts           6-parameter least-squares solve + apply
    tps.ts              thin-plate-spline solve + apply (phase 3)
    residuals.ts        per-GCP residuals (metres) + RMS
  render/
    WarpedRasterLayer.ts  Leaflet layer: mesh projection + per-triangle drawImage
  store/
    userMapStore.ts     IndexedDB persistence (maps, blobs, previews)
  components/
    UserMapRows.tsx     "Your maps" section in the layer list (import button, rows)
    ImportDialog.tsx    file picker/drop target, progress, privacy note
    GeoreferencePanel.tsx  split-view georeferencer
    GcpList.tsx         GCP table with residuals, delete, zoom-to
```

Every module containing logic gets a sibling `.test.ts(x)`, matching repo
convention; thin wiring files (the worker wrapper, presentational fragments)
are covered through the tests of the modules that drive them.
`transform/` and `parsers/` are pure (no DOM/Leaflet imports beyond types), so
they test headlessly in Vitest.

Integration points (the only edits outside `userMaps/`):

- `mapPanes.ts`: add a `user-maps` pane at **z-index 160** — directly above
  the aerial imagery pane (150) and below every data overlay (environmental
  health at 165, contours 180, parcels 200, roads 235, waterfalls 250) so
  parcel lines and roads stay readable on top of a draped scan.
- Layer list: mount `<UserMapRows>` as its own section.
- `MapCanvas.tsx`: mount `<UserMapLayers>` (renders one `WarpedRasterLayer`
  per enabled user map).
- `package.json`: the three approved dependencies.

### Data model

```ts
type UserMap = {
  id: string;
  name: string;
  source: "geotiff" | "geopdf" | "image";
  createdAt: string;                  // ISO-8601
  raster: Blob;                       // original file, untouched
  preview: Blob;                      // downsampled PNG used for all rendering
  pixelSize: { width: number; height: number };   // original pixel dimensions
  georef:
    | { kind: "embedded"; crs: string; geotransform: number[] }
    | { kind: "gcp"; gcps: Gcp[]; method: "affine" | "tps" };
};

type Gcp = {
  id: string;
  pixel: { x: number; y: number };    // original-image pixel space
  map: { lat: number; lng: number };  // WGS84
};
```

- The **original blob is kept** so re-georeferencing or export never loses
  fidelity and the preview can be regenerated at another resolution.
- GCPs are stored in **original pixel space** (not preview space) so preview
  resolution changes never invalidate them.
- GCP map coordinates are stored as WGS84 for portability, but **all solves
  and residuals run in projected Web Mercator metres** (the map's own space) —
  solving in raw lat/lng degrees would skew east–west vs north–south by
  ~cos(45°) at Nova Scotia latitudes.
- The `gcp` variant maps 1:1 onto an **Allmaps Georeference Annotation**, so
  phase-3 export/import is a serializer, not a redesign.

### Data flow

**Import:** file picked/dropped → `sniff.ts` → parser **in a web worker** →
downsample to a device-safe cap (≈4,096 px max dimension on iOS Safari,
8,192 px desktop; canvas limits are the binding constraint) → persist →
embedded georef? render immediately : open georeferencer.

**Georeferencer:** split view — scan (own pan/zoom) | live Leaflet map;
stacked with a tab toggle on narrow screens. Click scan, click map → one GCP.
At 3 GCPs the affine solve runs live and the warped scan appears under the
transparency slider; every subsequent point drag re-solves in real time.
`GcpList` shows per-point residuals in metres with the worst highlighted.
With exactly 3 points residuals are zero by construction, so the UI says
"add a 4th point to check accuracy" instead of a misleading 0 m. At 4+ points
a TPS toggle appears (phase 3). Save → layer row appears.

**Rendering:** `WarpedRasterLayer` projects its mesh into map space on each
*completed* view change (`moveend`/`zoomend`/`viewreset`/`resize`) — an 8×8
grid for embedded/affine (dense enough to absorb UTM→WebMercator curvature at
county scale), denser for TPS — and draws the preview bitmap through
per-triangle clipped `drawImage` at device-pixel-ratio resolution. During a
drag the pane carries the canvas; during zoom *animations* the raster jumps
rather than scaling smoothly — an accepted v1 trade-off, revisited only if it
grates in practice. Honors pane order and the per-map opacity slider.

### GeoPDF extraction (the risky module, isolated)

`geoPdfSource.ts` renders page 1 via pdf.js, then walks the PDF object tree
for both georegistration flavours found in the wild: OGC best-practice
`/Measure` dictionaries (`GPTS`/`LPTS` point arrays) and Adobe's legacy
`/LGIDict`. Both yield pixel↔CRS control points that feed the **same affine
solver** as the georeferencer. Unknown or missing dictionary → graceful
degrade to plain-scan georeferencing + a UI hint that
`gdal_translate in.pdf out.tif` converts offline. PR 4 starts with a
**1-day spike** against real files (USGS topo GeoPDFs are the canonical
corpus) before parser details are committed to.

## Error handling & guardrails

Typed errors with human messages for: unsupported file type, corrupt file,
unresolvable CRS, oversize file, quota failure.

- **CRS:** bundle proj4 defs for the NS-relevant set (EPSG 26920, 2961, 2962,
  4617, 4326, 3857) and accept embedded WKT; otherwise a clear "reproject to
  UTM 20N / WGS84" message.
- **Size:** soft warning ≈150 MB (aggressive downsample, note shown); hard
  refusal ≈500 MB with explanation. All decode work in workers with a
  progress indicator — the UI never blocks.
- **Quota:** IndexedDB write failure surfaces as "couldn't save — this map is
  available until you close the tab."
- **Privacy line** in the import dialog: *"Files stay on this device —
  nothing is uploaded."*

## Testing

- **Transforms:** golden fixtures — invent a transform, generate GCPs,
  recover parameters to machine precision; TPS must pass exactly through
  every GCP (its defining property); residual/RMS calcs against hand-computed
  values.
- **Parsers:** tiny script-generated GeoTIFF and GeoPDF fixtures in
  `web/src/test/fixtures/`, plus corrupt/truncated cases and a
  GeoPDF-without-geo-dictionary case (must degrade, not throw).
- **Components:** the repo's established mocked-react-leaflet pattern
  (rows, slider wiring, import flow, georeferencer state machine).
- **WarpedRasterLayer:** assert mesh geometry in map space (pure function),
  not rendered pixels.

## Phasing — four PRs up the ladder

| PR | Contents | Outcome |
|---|---|---|
| 1 | `sniff` + GeoTIFF parser + store + `WarpedRasterLayer` + layer rows + docs updates | Embedded-georef GeoTIFFs render end-to-end |
| 2 | Georeferencer UI + affine + residuals + plain-image sources | The portfolio demo |
| 3 | TPS mesh + Allmaps annotation export/import | Curved scans sit flat; interop |
| 4 | GeoPDF parser (spike first) | Full format coverage |

Each is a `feature/*` branch → PR into `nightly` per the promotion ladder.

## Documentation impact

New layer type + new persistence store, so PR 1 updates `README.md` (web
feature list), `ARCHITECTURE.md` (web section: userMaps module, IndexedDB),
and `plan.md` (new checklist items).

## Out of scope

- Server-side anything (no uploads, no shared maps, no accounts).
- Multi-page GeoPDFs (page 1 only; note shown if more pages exist).
- Mobile-optimized *editing* (georeferencer works stacked on phones but is
  designed desktop-first; viewing saved maps is first-class everywhere).
- Tile-pyramid optimization for very large rasters (can later hide behind
  the `WarpedRasterLayer` interface if panning perf demands it).
- iOS app parity (web-only feature; the iOS overlay engine is a separate
  design if ever wanted).
- Alpha bands, transparency masks, and nodata rendering (PR 1 renders every
  pixel opaque; 16-bit samples are scaled correctly, but alpha/nodata support
  is PR-2+ scope with its own tests).
- Full WKT CRS parsing. PR 1 accepts the six locked EPSG codes plus a
  best-effort `proj4` parse of the GeoTIFF citation string when the CRS key
  is user-defined (32767); exotic WKT beyond what proj4 accepts is rejected
  with the reproject message.
